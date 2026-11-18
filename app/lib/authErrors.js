// Firebase Auth 에러 코드를 사용자용 한국어 메시지로 변환
export function authErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/invalid-email":
      return "이메일 형식을 확인해주세요.";
    case "auth/email-already-in-use":
      return "이미 가입된 이메일입니다. 로그인해주세요.";
    case "auth/weak-password":
      return "비밀번호는 6자 이상으로 설정해주세요.";
    case "auth/operation-not-allowed":
      return "현재 회원가입이 허용되지 않습니다. 관리자에게 문의해주세요.";
    case "auth/too-many-requests":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    case "auth/network-request-failed":
      return "네트워크 연결을 확인한 뒤 다시 시도해주세요.";
    default:
      return error?.message || "인증 중 오류가 발생했습니다.";
  }
}
