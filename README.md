# anmawon-map

공개 목록 기반 안마원 지도 조회 페이지입니다.

배포 주소: https://payolajoker.github.io/anmawon-map/

## 기능

- 카카오맵 JavaScript API 기반 지도 표시
- 좌표가 있는 966곳만 지도 데이터로 사용
- 검색 및 예약, 주차, 홈페이지 필터
- 현재 위치 허용 시 가까운 3~5곳 중심으로 지도 표시
- 위치 미허용 시 겹침을 줄인 대표 핀 표시
- 마커 클릭 시 지도 밖 상세 정보 표시
- 지도 안 선택 레이블은 상호명과 전화번호만 표시
- 전화, 홈페이지, 카카오맵, 카카오 길찾기, 구글지도 링크
- 영업시간 원문을 요일별 `hoursNormalized` 구조로 정규화

## 포함 데이터

- 상호명
- 전화번호
- 홈페이지
- 주소
- 시간별 요금
- 영업시간
- 예약가능여부
- 주차가능여부
- 위도와 경도
- 소개 내용
- 요일별 정규화 영업시간

## 운영시간 정규화

정규화 스크립트:

```bash
python3 scripts/normalize_hours.py
```

결과 필드: `hoursNormalized`

- 스키마: `hours-normalized-v1`
- 시간대: `Asia/Seoul`
- 요일 키: `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`
- 각 요일 값: `status`, `ranges`
- 원문 보존: `hoursNormalized.raw`
- 사용자 표시용 문구: `hoursNormalized.display`
- 품질 확인: `reports/hours_normalization_report.md`

## 카카오맵 설정

GitHub Pages에서 카카오 지도가 뜨려면 카카오 개발자 콘솔의 Web 플랫폼 도메인에 아래 주소가 등록되어 있어야 합니다.

```text
https://payolajoker.github.io
```

로컬에서 확인하려면 필요에 따라 아래 주소도 등록합니다.

```text
http://127.0.0.1:4173
http://localhost:4173
```
