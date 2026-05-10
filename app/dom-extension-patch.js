/**
 * 크롬 확장 (Google Translate, Papago, Grammarly 등) 이 DOM 을 건드려서
 * React 가 removeChild 할 때 NotFoundError 가 발생하는 문제 방지.
 *
 * Node.prototype.removeChild 만 보수적으로 패치.
 * (insertBefore 는 패치하지 않음 — React 내부 트리 정합성 깨질 위험)
 */
export const domExtensionPatch = `
(function () {
  if (typeof window === 'undefined') return;
  if (window.__DOM_EXTENSION_PATCHED__) return;
  window.__DOM_EXTENSION_PATCHED__ = true;

  // removeChild: 자식이 아니면 silent 처리하고 React 가 계속 동작하도록
  var origRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      // 확장이 노드를 옮겼거나 이미 제거된 경우 - 에러 던지지 않고 child 반환
      console.warn('[DOMPatch] removeChild: 노드가 더 이상 자식이 아님 (확장 간섭)');
      return child;
    }
    return origRemoveChild.apply(this, arguments);
  };

  // 전역 unhandled 에러 캐치 - DOM 관련만 silent
  window.addEventListener('error', function (e) {
    var msg = (e && e.message) || '';
    if (msg.indexOf('removeChild') !== -1 || msg.indexOf('not a child of this node') !== -1) {
      console.warn('[DOMPatch] DOM 에러 무시:', msg);
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);
})();
`;
