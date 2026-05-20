// SimulationConnector.cs
// 웹앱에서 발급한 6자리 코드를 받아 Firestore의 simulations/{code} 문서를 조회·갱신한다.
//
// 사전 준비
//   1) Firebase Unity SDK 다운로드: https://firebase.google.com/download/unity
//      - FirebaseApp.unitypackage
//      - FirebaseFirestore.unitypackage
//   2) Firebase 콘솔 → 프로젝트 설정 → 앱 등록(Android/iOS/Standalone)
//      - Android: google-services.json 을 Assets/ 루트에 배치
//      - iOS: GoogleService-Info.plist 을 Assets/ 루트에 배치
//      - PC/Mac/Linux 빌드: 위 두 파일 중 하나만 있어도 동작
//   3) 본 스크립트를 빈 GameObject 에 부착하고 인스펙터에서 simulationCode 입력 후 Play
//      또는 다른 스크립트에서 SimulationConnector.Instance.LoadAsync("123456") 호출
//
// Firestore 문서 구조 (웹앱이 쓰는 필드와 일치해야 함)
//   simulations/{code}
//     topic                : string
//     audience             : string
//     duration             : string
//     feedbackItems        : array<string>
//     conditions           : array<string>
//     presentationMaterial : { name: string, type: string } | null
//     recordingUpload      : { bucket: string, rawVideoPath: string, fileName: string, mimeType: string }
//     status               : "waiting" | "in_progress" | "completed"
//     createdAt            : Timestamp (서버)
//     result               : map (시뮬레이션 종료 후 Unity가 Storage 업로드 결과를 기록)

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Firebase;
using Firebase.Extensions;
using Firebase.Firestore;
using UnityEngine;

namespace PublicSpeech.Simulation
{
    [FirestoreData]
    public class PresentationMaterialMeta
    {
        [FirestoreProperty] public string name { get; set; }
        [FirestoreProperty] public string type { get; set; }
    }

    [FirestoreData]
    public class RecordingUploadMeta
    {
        [FirestoreProperty] public string bucket { get; set; }
        [FirestoreProperty] public string basePath { get; set; }
        [FirestoreProperty] public string rawVideoPath { get; set; }
        [FirestoreProperty] public string fileName { get; set; }
        [FirestoreProperty] public string mimeType { get; set; }
    }

    [FirestoreData]
    public class SimulationData
    {
        [FirestoreProperty] public string topic { get; set; }
        [FirestoreProperty] public string audience { get; set; }
        [FirestoreProperty] public string duration { get; set; }
        [FirestoreProperty] public List<string> feedbackItems { get; set; }
        [FirestoreProperty] public List<string> conditions { get; set; }
        [FirestoreProperty] public PresentationMaterialMeta presentationMaterial { get; set; }
        [FirestoreProperty] public RecordingUploadMeta recordingUpload { get; set; }
        [FirestoreProperty] public string status { get; set; }
        [FirestoreProperty] public Timestamp createdAt { get; set; }
    }

    public class SimulationConnector : MonoBehaviour
    {
        public static SimulationConnector Instance { get; private set; }

        [Header("Test (Optional)")]
        [Tooltip("Play 시 자동으로 이 코드를 로드합니다. 비워두면 LoadAsync 호출 시까지 대기")]
        [SerializeField] private string simulationCode = "";

        public event Action<SimulationData> OnLoaded;
        public event Action<string> OnError;
        public event Action<SimulationData> OnUpdated;

        public SimulationData Current { get; private set; }
        public string CurrentCode { get; private set; }

        private FirebaseFirestore _db;
        private ListenerRegistration _listener;
        private bool _ready;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private async void Start()
        {
            await EnsureFirebaseAsync();
            if (!_ready) return;

            if (!string.IsNullOrWhiteSpace(simulationCode))
            {
                await LoadAsync(simulationCode);
            }
        }

        private void OnDestroy()
        {
            _listener?.Stop();
            if (Instance == this) Instance = null;
        }

        private async Task EnsureFirebaseAsync()
        {
            try
            {
                var status = await FirebaseApp.CheckAndFixDependenciesAsync();
                if (status != DependencyStatus.Available)
                {
                    EmitError($"Firebase 종속성 해결 실패: {status}");
                    return;
                }
                _db = FirebaseFirestore.DefaultInstance;
                _ready = true;
            }
            catch (Exception e)
            {
                EmitError($"Firebase 초기화 실패: {e.Message}");
            }
        }

        // 6자리 숫자 코드 검증
        private static bool IsValidCode(string code)
        {
            if (string.IsNullOrEmpty(code) || code.Length != 6) return false;
            foreach (var c in code) if (c < '0' || c > '9') return false;
            return true;
        }

        /// <summary>
        /// 코드를 기반으로 simulations/{code} 문서를 1회 조회한다.
        /// </summary>
        public async Task<SimulationData> LoadAsync(string code)
        {
            if (!_ready) await EnsureFirebaseAsync();
            if (!_ready) return null;

            if (!IsValidCode(code))
            {
                EmitError("코드 형식이 올바르지 않습니다 (6자리 숫자).");
                return null;
            }

            try
            {
                var snapshot = await _db.Collection("simulations").Document(code).GetSnapshotAsync();
                if (!snapshot.Exists)
                {
                    EmitError($"코드 {code} 에 해당하는 시뮬레이션 정보를 찾을 수 없습니다.");
                    return null;
                }

                var data = snapshot.ConvertTo<SimulationData>();
                Current = data;
                CurrentCode = code;
                OnLoaded?.Invoke(data);
                Debug.Log($"[SimulationConnector] Loaded {code}: topic='{data.topic}', items={data.feedbackItems?.Count ?? 0}");
                return data;
            }
            catch (Exception e)
            {
                EmitError($"문서 조회 실패: {e.Message}");
                return null;
            }
        }

        /// <summary>
        /// 실시간 변경 구독. 웹/Unity 양쪽에서 status·result 가 갱신될 때 콜백.
        /// </summary>
        public void ListenForUpdates(string code)
        {
            if (!_ready) { EmitError("Firebase 준비 전입니다."); return; }
            if (!IsValidCode(code)) { EmitError("코드 형식이 올바르지 않습니다."); return; }

            _listener?.Stop();
            CurrentCode = code;
            _listener = _db.Collection("simulations").Document(code)
                .Listen(snapshot =>
                {
                    if (!snapshot.Exists) return;
                    var data = snapshot.ConvertTo<SimulationData>();
                    Current = data;
                    OnUpdated?.Invoke(data);
                });
        }

        /// <summary>
        /// 진행 상태 업데이트 (예: "in_progress", "completed").
        /// </summary>
        public Task UpdateStatusAsync(string status)
        {
            if (!_ready || string.IsNullOrEmpty(CurrentCode)) return Task.CompletedTask;
            return _db.Collection("simulations").Document(CurrentCode)
                .UpdateAsync(new Dictionary<string, object>
                {
                    { "status", status },
                    { "updatedAt", FieldValue.ServerTimestamp },
                });
        }

        /// <summary>
        /// 시뮬레이션 종료 후 결과를 simulations/{code}.result 에 기록한다.
        /// resultPayload 는 Firestore 가 직렬화 가능한 Dictionary<string, object> 형태.
        /// </summary>
        public Task SubmitResultAsync(Dictionary<string, object> resultPayload)
        {
            if (!_ready || string.IsNullOrEmpty(CurrentCode)) return Task.CompletedTask;
            return _db.Collection("simulations").Document(CurrentCode)
                .UpdateAsync(new Dictionary<string, object>
                {
                    { "result", resultPayload },
                    { "status", "completed" },
                    { "completedAt", FieldValue.ServerTimestamp },
                });
        }

        private void EmitError(string message)
        {
            Debug.LogError($"[SimulationConnector] {message}");
            OnError?.Invoke(message);
        }
    }
}
