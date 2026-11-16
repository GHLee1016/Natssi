import { useCallback, useEffect, useState } from 'react'

// on이 ms 이상 이어질 때만 true. 금방 끝나는 로딩은 아예 보여주지 않아 깜빡임을 막는다.
export function useSlow(on, ms = 300) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!on) { setSlow(false); return undefined }
    const t = setTimeout(() => setSlow(true), ms)
    return () => clearTimeout(t)
  }, [on, ms])
  return slow
}

// 불러오기 상태(로딩·오류·재시도)를 한곳에서 처리
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const run = useCallback(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e) => alive && setState({ data: null, error: e.message, loading: false }))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => run(), [run])
  return { ...state, reload: run, setData: (data) => setState({ data, error: null, loading: false }) }
}

export function Status({ loading, error, reload }) {
  const slow = useSlow(loading, 250)
  if (loading) return slow ? <div className="skeleton" aria-busy="true"><div /><div /><div /></div> : null
  if (error) return (
    <div className="card error" role="alert">
      <p>{error}</p>
      <button className="btn ghost" onClick={reload}>다시 불러오기</button>
    </div>
  )
  return null
}
