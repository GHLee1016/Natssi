// 리포트는 한 번 쓰면 기억해 두고, 기록이 바뀔 때(clear)만 다시 쓴다.
// 탭을 옮겨 다녀도 같은 리포트와 이어서 물어본 대화가 그대로 남고, AI를 다시 부르지 않는다.
// key = 누구의 어느 날 기준인지(로그인 사용자, 오늘 날짜). 키가 바뀌면 자동으로 새로 쓴다.
const rc = { key: null, promise: null, data: null, thread: [] }

export const reportStore = {
  data: (key) => (rc.key === key ? rc.data : null),
  thread: (key) => (rc.key === key ? rc.thread : []),
  setThread(key, thread) { if (rc.key === key) rc.thread = thread },
  // 같은 키로 이미 불러왔거나 불러오는 중이면 그 결과를 그대로 돌려준다(중복 요청 없음).
  load(key, fetcher) {
    if (rc.key !== key) {
      rc.key = key; rc.data = null; rc.thread = []
      rc.promise = fetcher().then((d) => { if (rc.key === key) rc.data = d; return d })
        .catch((e) => { if (rc.key === key) { rc.key = null; rc.promise = null }; throw e })   // 실패는 기억하지 않아 다음에 다시 시도
    }
    return rc.promise
  },
  clear() { rc.key = null; rc.promise = null; rc.data = null; rc.thread = [] },
}
