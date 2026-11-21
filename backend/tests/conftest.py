from app import config

config.DEMO_SHIFT_DAYS = 0      # 테스트는 접속일과 무관하게 기준일(11/16)로 고정
config.DEMO_ENV_DISTRICT = None  # 이야기 검사는 가상 환경값으로(실제 환경값을 붙인 데모는 test_env.py)
config.ENV_SOURCE = "csv"         # 테스트는 네트워크 없이 함께 배포한 CSV만 읽는다
