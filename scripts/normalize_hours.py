#!/usr/bin/env python3
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS_PATH = ROOT / "data" / "shops.slim.js"
JSON_PATH = ROOT / "data" / "shops.slim.json"
REPORT_PATH = ROOT / "reports" / "hours_normalization_report.md"

DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_LABEL = {"mon": "월", "tue": "화", "wed": "수", "thu": "목", "fri": "금", "sat": "토", "sun": "일"}
DAY_CHAR = {"월": "mon", "화": "tue", "수": "wed", "목": "thu", "금": "fri", "토": "sat", "일": "sun"}
DAY_INDEX = {day: i for i, day in enumerate(DAY_ORDER)}

TIME_TOKEN = r"(?:오전|오후|저녁|밤|새벽|AM|PM|A\.M|P\.M|am|pm)?\s*\d{1,2}\s*(?::+\s*\d{0,3}|시\s*(?:\d{1,2}\s*분?|반)?|)\s*(?:AM|PM|A\.M|P\.M|am|pm)?"
TIME_RANGE = rf"(?P<start>{TIME_TOKEN})\s*(?:~|∼|〜|-|부터)\s*(?P<end>{TIME_TOKEN})\s*(?:까지)?"
TIME_RANGE_RE = re.compile(TIME_RANGE)

DAY_WORD = r"(?:평일|주말|매일|연중무휴|월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일|공휴일)"
DAY_EXPR = rf"{DAY_WORD}(?:(?:\s*(?:~|-|,|/|및|과|와|\.|·|ㆍ|\s)\s*){DAY_WORD})*"
DAY_RANGE_RE = re.compile(rf"(?P<day>{DAY_EXPR})\s*(?:[:：]|\(|\)|,|/|및|과|와|\s|-)*\s*(?P<range>{TIME_RANGE})")

PARSER_VERSION = "2026-06-29.3"
SCHEMA_VERSION = "hours-normalized-v1"


def load_payload():
    text = JS_PATH.read_text(encoding="utf-8")
    match = re.search(r"window\.ANMAWON_DATA\s*=\s*(\{.*\});?\s*$", text, re.S)
    if not match:
        raise RuntimeError("Cannot parse data/shops.slim.js")
    return json.loads(match.group(1))


def clean_text(raw):
    text = str(raw or "").strip().strip('"').strip()
    replacements = {
        "：": ":", "∼": "~", "〜": "~", "－": "-", "–": "-", "—": "-",
        "ㆍ": ".", "·": ".", "：": ":", "～": "~",
    }
    for a, b in replacements.items():
        text = text.replace(a, b)
    text = re.sub(r"(?i)(\d{1,2}:\d{1,2})\s*A\.?M\.??", r"오전 \1", text)
    text = re.sub(r"(?i)(\d{1,2}:\d{1,2})\s*P\.?M\.??", r"오후 \1", text)
    text = re.sub(r"(?i)A\.?M\.??\s*(\d{1,2}:?\d{0,2})", r"오전 \1", text)
    text = re.sub(r"(?i)P\.?M\.??\s*(\d{1,2}:?\d{0,2})", r"오후 \1", text)
    text = re.sub(r"(\d{1,2})\s*:+\s*(\d{1,3})", lambda m: f"{m.group(1)}:{m.group(2)}", text)
    text = re.sub(r"\((오전|오후)\)", r"\1", text)
    # 오전 10시 오후 8시처럼 구분자가 빠진 경우 보정
    mer_time = r"(?:오전|오후|저녁|밤|새벽)\s*\d{1,2}\s*(?:시\s*(?:\d{1,2}\s*분?|반)?|:\s*\d{1,2})?"
    text = re.sub(rf"({mer_time})\s+({mer_time})", r"\1~\2", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fmt_time(hour, minute):
    if hour == 24:
        return "24:00"
    return f"{hour:02d}:{minute:02d}"


def parse_time_token(token, role="start"):
    original = token
    token = clean_text(token)
    warnings = []
    meridiem = None
    lower = token.lower()
    if any(x in token for x in ["오전", "새벽"]) or "am" in lower or "a.m" in lower:
        meridiem = "am"
    if any(x in token for x in ["오후", "저녁", "밤"]) or "pm" in lower or "p.m" in lower:
        meridiem = "pm"

    nums = re.findall(r"\d{1,3}", token)
    if not nums:
        return None, warnings + [f"time_missing:{original}"]
    hour = int(nums[0])
    minute = 0
    has_colon = ":" in token
    zero_padded_hour = bool(re.search(r"(?:^|\s)(?:오전|오후|저녁|밤|새벽)?\s*0\d", token))
    if len(nums) >= 2:
        minute = int(nums[1])
    if "반" in token and len(nums) == 1:
        minute = 30
    if minute >= 60:
        warnings.append(f"minute_fixed:{original}")
        minute = 0

    if meridiem == "am":
        if hour == 12:
            hour = 0
    elif meridiem == "pm":
        if hour < 12:
            hour += 12
        elif hour > 24:
            warnings.append(f"hour_invalid:{original}")
            hour = hour % 24

    if hour > 24:
        warnings.append(f"hour_invalid:{original}")
        hour = min(hour, 24)
    if hour == 24 and minute != 0:
        warnings.append(f"time_24_minute_fixed:{original}")
        minute = 0
    return {
        "hour": hour,
        "minute": minute,
        "raw": original,
        "meridiem": meridiem,
        "hasColon": has_colon,
        "zeroPaddedHour": zero_padded_hour,
    }, warnings


def parse_time_range(range_text):
    text = clean_text(range_text)
    m = TIME_RANGE_RE.search(text)
    if not m:
        return None, [f"range_missing:{range_text}"]
    start, w1 = parse_time_token(m.group("start"), "start")
    end, w2 = parse_time_token(m.group("end"), "end")
    warnings = w1 + w2
    if not start or not end:
        return None, warnings

    # 오전9시~6시 / 9시~6시 같은 축약형 보정
    if end["meridiem"] is None:
        duration = (end["hour"] * 60 + end["minute"]) - (start["hour"] * 60 + start["minute"])
        end_is_zero_padded = end.get("zeroPaddedHour")
        both_colon = start.get("hasColon") and end.get("hasColon")
        both_korean_hour = not start.get("hasColon") and not end.get("hasColon")
        if start["meridiem"] == "am" and 1 <= end["hour"] <= 11:
            end["hour"] += 12
            warnings.append("end_pm_inferred_from_am_start")
        elif start["meridiem"] == "pm" and 1 <= end["hour"] <= 11:
            end["hour"] += 12
            warnings.append("end_pm_inferred_from_pm_start")
        elif start["meridiem"] is None and both_korean_hour and start["hour"] >= 6 and end["hour"] <= 12 and duration < 180:
            end["hour"] += 12
            warnings.append("end_pm_inferred_short_duration")
        elif start["meridiem"] is None and not end_is_zero_padded and not both_colon and end["hour"] <= start["hour"] and end["hour"] <= 12:
            end["hour"] += 12
            warnings.append("end_pm_inferred_order")

    start_minutes = start["hour"] * 60 + start["minute"]
    end_minutes = end["hour"] * 60 + end["minute"]
    next_day = False
    if end["hour"] != 24 and end_minutes <= start_minutes:
        next_day = True
        warnings.append("close_next_day")

    return {
        "open": fmt_time(start["hour"], start["minute"]),
        "close": fmt_time(end["hour"], end["minute"]),
        "nextDay": next_day,
    }, warnings


def extract_time_ranges(text):
    ranges = []
    warnings = []
    for m in TIME_RANGE_RE.finditer(text):
        parsed, w = parse_time_range(m.group(0))
        warnings.extend(w)
        if parsed:
            ranges.append(parsed)
    return ranges, warnings


def parse_breaks(text):
    breaks = []
    warnings = []
    break_regex = re.compile(rf"(?:휴게시간|휴게|점심시간|점심)\s*[^/()]*?({TIME_RANGE})")
    for m in break_regex.finditer(text):
        parsed, w = parse_time_range(m.group(1))
        warnings.extend(w)
        if parsed:
            breaks.append({"start": parsed["open"], "end": parsed["close"]})
    stripped = break_regex.sub(" ", text)
    return breaks, stripped, warnings


def ordered_days(days):
    return [d for d in DAY_ORDER if d in set(days)]


def days_between(start_day, end_day):
    si, ei = DAY_INDEX[start_day], DAY_INDEX[end_day]
    if si <= ei:
        return DAY_ORDER[si:ei + 1]
    return DAY_ORDER[si:] + DAY_ORDER[:ei + 1]


def days_from_expr(expr):
    expr = clean_text(expr)
    holiday = "공휴" in expr
    expr = re.sub(r"공휴일|당일|휴일|명절|영업일", " ", expr)
    expr = expr.replace("요일", "").replace("주일", "일")
    days = []
    if "매일" in expr or "연중무휴" in expr or re.search(r"월\s*[~-]\s*일", expr):
        days.extend(DAY_ORDER)
    if "평일" in expr:
        days.extend(DAY_ORDER[:5])
    if "주말" in expr:
        days.extend(["sat", "sun"])
    # 위에서 의미 단위로 처리한 단어들은 이후 단일 글자 요일 추출에서 제외한다.
    # 예: "평일" 안의 "일"을 일요일로 오인하면 안 된다.
    expr = re.sub(r"평일|매일|주말|연중무휴", " ", expr)
    for a, b in re.findall(r"([월화수목금토일])\s*[~-]\s*([월화수목금토일])", expr):
        days.extend(days_between(DAY_CHAR[a], DAY_CHAR[b]))
    no_ranges = re.sub(r"[월화수목금토일]\s*[~-]\s*[월화수목금토일]", " ", expr)
    # 붙여쓴 요일열(월화수금) 또는 구분자가 있는 요일만 요일로 인정한다.
    for token in re.findall(r"[월화수목금토일]{2,}|[월화수목금토일](?=\s|,|\.|/|$|\)|\(|:|：)", no_ranges):
        for ch in token:
            days.append(DAY_CHAR[ch])
    return ordered_days(days), holiday


def closed_days_and_holiday(text):
    if re.search(r"휴무\s*없음|휴일\s*없음|연중\s*무휴", text):
        no_regular_closed = True
    else:
        no_regular_closed = False

    closed = set()
    notes = []
    holiday = "unknown"
    if re.search(r"공휴일[^/,.()]{0,12}(영업|정상)", text):
        holiday = "open"
    if re.search(r"공휴일[^/,.()]{0,12}(휴무|휴일|쉼)", text):
        holiday = "closed"
    if re.search(r"명절[^/,.()]{0,20}휴무", text):
        notes.append("명절 휴무")

    if no_regular_closed:
        return [], holiday, notes

    day_unit = r"(?:월요일|화요일|수요일|목요일|금요일|토요일|일요일|주일|(?<![가-힣])[월화수목금토일]{1,7}(?![가-힣]))"
    day_list = rf"{day_unit}(?:(?:\s*(?:,|\.|/|~|-|및|과|와|\s)\s*){day_unit})*"
    closed_patterns = [
        rf"(?P<days>{day_list})\s*(?:은|는|만|에|:|：|\(|\)|\s)*\s*(?:정기\s*)?(?:휴무|휴일|쉽니다|쉼|영업\s*X)",
        rf"(?:휴무|휴일)\s*[:：]\s*(?P<days>{day_list})",
        rf"(?P<days>{day_list})\s*\(\s*정기\s*휴무\s*\)",
    ]
    for pattern in closed_patterns:
        for m in re.finditer(pattern, text):
            window = m.group(0)
            context = text[max(0, m.start() - 2):m.end() + 2]
            if "당일" in context and not re.search(r"일요일|주일", window):
                notes.append(window.strip())
                continue
            if re.search(r"첫째|둘째|셋째|넷째|다섯|5번째|번째", window):
                notes.append(window.strip())
                continue
            days, _ = days_from_expr(m.group("days"))
            closed.update(days)

    return ordered_days(closed), holiday, notes


def apply_range(schedule, days, time_range):
    for day in days:
        schedule[day] = {"status": "open", "ranges": [time_range]}


def day_group_label(days):
    days = ordered_days(days)
    if days == DAY_ORDER:
        return "매일"
    groups = []
    i = 0
    while i < len(days):
        start = i
        while i + 1 < len(days) and DAY_INDEX[days[i + 1]] == DAY_INDEX[days[i]] + 1:
            i += 1
        if start == i:
            groups.append(DAY_LABEL[days[i]])
        else:
            groups.append(f"{DAY_LABEL[days[start]]}-{DAY_LABEL[days[i]]}")
        i += 1
    return ",".join(groups)


def range_label(r):
    suffix = "+1" if r.get("nextDay") else ""
    return f"{r['open']}-{r['close']}{suffix}"


def make_display(schedule, status, raw, breaks, holiday, notes):
    if status == "unknown":
        return "확인 필요"
    if status == "inquiry":
        return "전화 문의"
    if status == "reservation_only":
        return "예약제 운영"

    buckets = defaultdict(list)
    for day in DAY_ORDER:
        item = schedule[day]
        if item["status"] == "open" and item["ranges"]:
            key = " / ".join(range_label(r) for r in item["ranges"])
        elif item["status"] == "closed":
            key = "휴무"
        else:
            key = "확인 필요"
        buckets[key].append(day)

    # 전부 확인 필요면 원문 상태를 보존
    if len(buckets) == 1 and next(iter(buckets.keys())) == "확인 필요":
        if "연중" in raw and "무휴" in raw:
            return "연중무휴, 시간 확인 필요"
        return raw or "확인 필요"

    parts = []
    for key, days in sorted(buckets.items(), key=lambda item: DAY_INDEX[item[1][0]]):
        if key == "확인 필요" and len(days) >= 5:
            continue
        parts.append(f"{day_group_label(days)} {key}")
    if breaks:
        parts.append("휴게 " + ", ".join(f"{b['start']}-{b['end']}" for b in breaks))
    if holiday == "open":
        parts.append("공휴일 영업")
    elif holiday == "closed":
        parts.append("공휴일 휴무")
    return " / ".join(parts) if parts else (raw or "확인 필요")


def normalize_hours(raw):
    original = str(raw or "").strip()
    text = clean_text(original)
    warnings = []
    notes = []
    breaks, text_wo_break, break_warnings = parse_breaks(text)
    warnings.extend(break_warnings)
    closed_days, holiday, closed_notes = closed_days_and_holiday(text)
    notes.extend(closed_notes)

    schedule = {day: {"status": "unknown", "ranges": []} for day in DAY_ORDER}
    for day in closed_days:
        schedule[day] = {"status": "closed", "ranges": []}

    if not text:
        status = "unknown"
        confidence = 0.0
        display = "확인 필요"
        return result(original, status, schedule, closed_days, breaks, holiday, notes, warnings, confidence, display)

    inquiry = bool(re.search(r"전화\s*문의|문의\s*요망", text))
    reservation_only = bool(re.search(r"예약제(?:\s*운영)?|예약필수|예약\s*필수", text)) and not TIME_RANGE_RE.search(text_wo_break)
    variable = bool(re.search(r"유동적|조율|예약상황|변동|사정에 의해|예약시", text))
    open_24h = bool(re.search(r"24\s*시간", text)) and not re.search(r"\d{1,2}:\d{2}\s*[~-]\s*24:00", text)

    if inquiry:
        status = "inquiry"
    elif reservation_only:
        status = "reservation_only"
    elif open_24h:
        status = "open_24h"
    else:
        status = "parsed"

    if variable:
        notes.append("운영시간 유동 가능")

    if open_24h:
        days = [d for d in DAY_ORDER if d not in closed_days]
        apply_range(schedule, days, {"open": "00:00", "close": "24:00", "nextDay": False})
    else:
        matched_spans = []
        day_matches = []
        for m in DAY_RANGE_RE.finditer(text_wo_break):
            days, holiday_match = days_from_expr(m.group("day"))
            parsed, w = parse_time_range(m.group("range"))
            warnings.extend(w)
            if parsed:
                if holiday_match:
                    if holiday == "unknown":
                        holiday = "open"
                    notes.append(f"공휴일 {range_label(parsed)}")
                if days:
                    day_matches.append((days, parsed, m.group(0)))
                    matched_spans.append(m.span())
        for days, parsed, _ in day_matches:
            apply_range(schedule, [d for d in days if d not in closed_days], parsed)

        if not day_matches:
            ranges, w = extract_time_ranges(text_wo_break)
            warnings.extend(w)
            if ranges:
                default_days = [d for d in DAY_ORDER if d not in closed_days]
                apply_range(schedule, default_days, ranges[0])
                if len(ranges) > 1:
                    warnings.append("extra_ranges_without_day_labels")
        else:
            # 명시 폐점요일은 닫힘으로 유지. 나머지 미기재 요일은 확인 필요.
            pass

    open_count = sum(1 for d in DAY_ORDER if schedule[d]["status"] == "open")
    closed_count = sum(1 for d in DAY_ORDER if schedule[d]["status"] == "closed")
    unknown_count = 7 - open_count - closed_count

    if status in {"inquiry", "reservation_only"} and open_count == 0:
        confidence = 0.2
    elif open_count == 0:
        confidence = 0.25 if text else 0.0
    elif unknown_count == 0:
        confidence = 0.9 if not warnings else 0.78
    elif open_count >= 5 and closed_count >= 1:
        confidence = 0.82 if not warnings else 0.72
    else:
        confidence = 0.68 if not warnings else 0.55

    if variable:
        confidence = min(confidence, 0.55)
    if any(w.startswith("minute_fixed") or w.startswith("hour_invalid") for w in warnings):
        confidence = min(confidence, 0.5)
    confidence = round(max(0.0, min(1.0, confidence)), 2)
    display = make_display(schedule, status, text, breaks, holiday, notes)
    return result(original, status, schedule, closed_days, breaks, holiday, notes, warnings, confidence, display)


def result(raw, status, schedule, closed_days, breaks, holiday, notes, warnings, confidence, display):
    return {
        "schema": SCHEMA_VERSION,
        "parserVersion": PARSER_VERSION,
        "timezone": "Asia/Seoul",
        "raw": raw,
        "status": status,
        "display": display,
        "days": schedule,
        "closedDays": closed_days,
        "holiday": holiday,
        "breaks": breaks,
        "notes": notes,
        "warnings": sorted(set(warnings)),
        "confidence": confidence,
    }


def write_payload(payload):
    payload.setdefault("metadata", {})["hoursNormalization"] = {
        "schema": SCHEMA_VERSION,
        "parserVersion": PARSER_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "rawField": "hours",
        "normalizedField": "hoursNormalized",
        "timezone": "Asia/Seoul",
    }
    JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    JS_PATH.write_text("window.ANMAWON_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


def make_report(shops):
    status_counter = Counter(s["hoursNormalized"]["status"] for s in shops)
    confidence_buckets = Counter()
    for s in shops:
        c = s["hoursNormalized"]["confidence"]
        if c >= 0.8:
            confidence_buckets["0.80-1.00"] += 1
        elif c >= 0.5:
            confidence_buckets["0.50-0.79"] += 1
        elif c > 0:
            confidence_buckets["0.01-0.49"] += 1
        else:
            confidence_buckets["0"] += 1
    open_days_counter = Counter()
    for s in shops:
        hn = s["hoursNormalized"]
        open_days = sum(1 for d in DAY_ORDER if hn["days"][d]["status"] == "open")
        open_days_counter[open_days] += 1
    empty_raw = [s for s in shops if not str(s["hoursNormalized"]["raw"] or "").strip()]
    low = [
        s for s in shops
        if s["hoursNormalized"]["confidence"] < 0.5
        and str(s["hoursNormalized"]["raw"] or "").strip()
    ][:80]
    warn = [s for s in shops if s["hoursNormalized"]["warnings"]][:80]
    lines = []
    lines.append("# 운영시간 정규화 보고서")
    lines.append("")
    lines.append(f"- 생성일: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"- 대상: {len(shops)}곳")
    lines.append(f"- 스키마: `{SCHEMA_VERSION}`")
    lines.append(f"- 파서: `{PARSER_VERSION}`")
    lines.append("")
    lines.append("## 상태별 건수")
    for k, v in status_counter.most_common():
        lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## 신뢰도 구간")
    for k in ["0.80-1.00", "0.50-0.79", "0.01-0.49", "0"]:
        lines.append(f"- {k}: {confidence_buckets[k]}")
    lines.append("")
    lines.append("## 영업 요일 수")
    for k in sorted(open_days_counter):
        lines.append(f"- {k}일 영업으로 파싱: {open_days_counter[k]}")
    lines.append("")
    lines.append("## 낮은 신뢰도 샘플")
    lines.append(f"- 원문 영업시간 공란: {len(empty_raw)}곳")
    for s in low:
        hn = s["hoursNormalized"]
        lines.append(f"- {s['name']}: `{hn['raw']}` → `{hn['display']}` / confidence={hn['confidence']} / status={hn['status']}")
    lines.append("")
    lines.append("## 경고 샘플")
    for s in warn:
        hn = s["hoursNormalized"]
        lines.append(f"- {s['name']}: `{hn['raw']}` → `{hn['display']}` / warnings={', '.join(hn['warnings'][:4])}")
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    payload = load_payload()
    shops = payload.get("shops", [])
    for shop in shops:
        shop["hoursNormalized"] = normalize_hours(shop.get("hours"))
    write_payload(payload)
    make_report(shops)
    status_counter = Counter(s["hoursNormalized"]["status"] for s in shops)
    print(json.dumps({
        "count": len(shops),
        "status": status_counter,
        "report": str(REPORT_PATH),
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
