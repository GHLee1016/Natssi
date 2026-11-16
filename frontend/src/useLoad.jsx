import { useCallback, useEffect, useState } from 'react'

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
  if (loading) return <div className="skeleton" aria-busy="true"><div /><div /><div /></div>
  if (error) return (
    <div className="card error" role="alert">
      <p>{error}</p>
      <button className="btn ghost" onClick={reload}>다시 불러오기</button>
    </div>
  )
  return null
}
