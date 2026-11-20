import os
import time

import requests


def service_key() -> str:
    key = os.environ.get("DATA_GO_KR_KEY")
    if not key:
        raise RuntimeError(
            "환경변수 DATA_GO_KR_KEY가 없습니다. 공공데이터포털 마이페이지의 "
            "'일반 인증키(Decoding)' 값을 넣어 주세요."
        )
    return key


def get_items(url: str, params: dict, timeout: int = 15) -> tuple[list[dict], int]:
    """data.go.kr JSON 응답에서 (items, totalCount)를 꺼낸다. 오류 코드면 예외."""
    key = service_key()
    params = {"serviceKey": key, **params}
    for attempt in range(3):   # data.go.kr은 가끔 연결이 끊긴다 → 3번까지
        try:
            r = requests.get(url, params=params, timeout=timeout)
            r.raise_for_status()
            break
        except requests.RequestException as e:
            if attempt == 2:
                # 예외 메시지의 URL에 키가 들어 있어 로그에 남지 않게 지운다
                raise RuntimeError(f"요청 실패: {str(e).replace(key, '***')[:200]}") from None
            time.sleep(2 * (attempt + 1))
    try:
        data = r.json()
    except ValueError:
        # 키 오류 등은 JSON 대신 XML로 돌아오는 경우가 많다
        raise RuntimeError(f"JSON이 아닌 응답: {r.text[:300]}")

    if "OpenAPI_ServiceResponse" in data:  # 키 미등록 등 게이트웨이 오류
        h = data["OpenAPI_ServiceResponse"].get("cmmMsgHeader", {})
        raise RuntimeError(f"API 오류: {h.get('errMsg')} ({h.get('returnAuthMsg')})")
    resp = data.get("response", data)
    header = resp.get("header", {})
    code = str(header.get("resultCode", "00"))
    if code not in ("00", "0"):
        if code == "03":  # NO_DATA
            return [], 0
        raise RuntimeError(f"API 오류 {code}: {header.get('resultMsg')}")

    body = resp.get("body", {})
    items = body.get("items", [])
    if isinstance(items, dict):  # 기상청은 items.item, 에어코리아는 items 리스트
        items = items.get("item", [])
    if isinstance(items, dict):
        items = [items]
    return items or [], int(body.get("totalCount", 0) or 0)
