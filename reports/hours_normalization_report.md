# 운영시간 정규화 보고서

- 생성일: 2026-06-29 11:26:53
- 대상: 966곳
- 스키마: `hours-normalized-v1`
- 파서: `2026-06-29.3`

## 상태별 건수
- parsed: 622
- unknown: 329
- open_24h: 7
- inquiry: 5
- reservation_only: 3

## 신뢰도 구간
- 0.80-1.00: 567
- 0.50-0.79: 57
- 0.01-0.49: 13
- 0: 329

## 영업 요일 수
- 0일 영업으로 파싱: 342
- 1일 영업으로 파싱: 5
- 2일 영업으로 파싱: 1
- 4일 영업으로 파싱: 2
- 5일 영업으로 파싱: 7
- 6일 영업으로 파싱: 95
- 7일 영업으로 파싱: 514

## 낮은 신뢰도 샘플
- 원문 영업시간 공란: 329곳
- 다온 안마원: `예약제 운영` → `예약제 운영` / confidence=0.2 / status=reservation_only
- 원당가족안마원: `월~금 - 출장안마만 시행 / 토요일 오전에 출장안마만 시행` → `월~금 - 출장안마만 시행 / 토요일 오전에 출장안마만 시행` / confidence=0.25 / status=parsed
- 가나다좋은행복안마원: `전화 문의` → `전화 문의` / confidence=0.2 / status=inquiry
- 계양건강안마원: `전화 문의` → `전화 문의` / confidence=0.2 / status=inquiry
- 김영수지압안마원: `전화 문의` → `전화 문의` / confidence=0.2 / status=inquiry
- 동양안마지압원: `전화 문의` → `전화 문의` / confidence=0.2 / status=inquiry
- 랑안마원: `전화 문의` → `전화 문의` / confidence=0.2 / status=inquiry
- 청주지압교정안마원: `연중무휴` → `연중무휴, 시간 확인 필요` / confidence=0.25 / status=parsed
- 동양지압 시술원: `예약제` → `예약제 운영` / confidence=0.2 / status=reservation_only
- 실로암안마지압원: `22:00 까지` → `22:00 까지` / confidence=0.25 / status=parsed
- 정선생안마지압원: `60분 60,000원` → `60분 60,000원` / confidence=0.25 / status=parsed
- 진주지압 안마원: `예약필수` → `예약제 운영` / confidence=0.2 / status=reservation_only
- 성심안마원: `(8:00- )` → `(8:00- )` / confidence=0.25 / status=parsed

## 경고 샘플
- 메디칼지압안마원: `10시-7시` → `매일 10:00-19:00` / warnings=end_pm_inferred_short_duration
- 명지압안마원: `10시-8시` → `매일 10:00-20:00` / warnings=end_pm_inferred_short_duration
- 승록안마원(중곡): `9시-6시` → `매일 09:00-18:00` / warnings=end_pm_inferred_short_duration
- 우리통증안마원: `예약시간 기준10시 ~ 6시반 (8시)` → `매일 10:00-18:30` / warnings=end_pm_inferred_short_duration
- 거북지압원: `평일-오전 10시~오후7시 토,공휴일-오전 10시~5시 일요일휴무` → `월-금 10:00-19:00 / 토 10:00-17:00 / 일 휴무 / 공휴일 영업` / warnings=end_pm_inferred_from_am_start
- 바른몸건강 지킴이 안마원: `평일,공휴일 9시~6시 / 토요일 9시~12시 / 일요일 휴무 / 점심시간 오후1시~2시` → `월-금 09:00-18:00 / 토 09:00-12:00 / 일 휴무 / 휴게 13:00-14:00 / 공휴일 영업` / warnings=end_pm_inferred_from_pm_start, end_pm_inferred_short_duration
- 승록안마원: `10:00~20:00 /10:00~17:00` → `매일 10:00-20:00` / warnings=extra_ranges_without_day_labels
- 약손경락지압원: `09:00 ~ 18:00 일요일 휴무 점심시간 (12:00~13:00)` → `월-토 09:00-18:00 / 일 휴무` / warnings=extra_ranges_without_day_labels
- 전통경락안마원: `09:090~19:00` → `매일 09:00-19:00` / warnings=minute_fixed:09:090
- 신제주지압원: `10:00 ~ 02:00` → `매일 10:00-02:00+1` / warnings=close_next_day
