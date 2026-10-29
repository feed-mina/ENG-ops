from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
FONT_REGULAR = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")

BRAND = HexColor("#B94678")
BRAND_DARK = HexColor("#8E2B57")
NAVY = HexColor("#1E2D46")
BLUE = HexColor("#2E88C5")
MINT = HexColor("#EAF7F4")
PINK = HexColor("#FBEAF1")
PALE_BLUE = HexColor("#EAF3FA")
PALE_GOLD = HexColor("#FFF5D9")
PALE_RED = HexColor("#FDECEC")
INK = HexColor("#26354D")
MUTED = HexColor("#667085")
LINE = HexColor("#D8DEE8")
PAPER = HexColor("#FAFAFC")
WHITE = colors.white


def register_fonts() -> None:
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise FileNotFoundError("맑은 고딕 글꼴을 찾을 수 없습니다.")
    pdfmetrics.registerFont(TTFont("Malgun", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_BOLD)))


def make_styles(audience: str) -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    owner = audience == "owner"
    body_size = 11.2 if owner else 9.4
    body_leading = 18.0 if owner else 14.4
    styles = {
        "cover_kicker": ParagraphStyle(
            "cover_kicker",
            parent=base["Normal"],
            fontName="MalgunBold",
            fontSize=11 if owner else 10,
            leading=15,
            textColor=BRAND,
            alignment=TA_LEFT,
            spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Title"],
            fontName="MalgunBold",
            fontSize=27 if owner else 25,
            leading=38 if owner else 34,
            textColor=NAVY,
            alignment=TA_LEFT,
            spaceAfter=16,
        ),
        "cover_subtitle": ParagraphStyle(
            "cover_subtitle",
            parent=base["Normal"],
            fontName="Malgun",
            fontSize=13 if owner else 11.2,
            leading=21 if owner else 18,
            textColor=MUTED,
            spaceAfter=18,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="MalgunBold",
            fontSize=19 if owner else 16,
            leading=27 if owner else 23,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=10,
            keepWithNext=True,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="MalgunBold",
            fontSize=14 if owner else 12.2,
            leading=21 if owner else 18,
            textColor=BRAND_DARK,
            spaceBefore=8,
            spaceAfter=6,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="MalgunBold",
            fontSize=12 if owner else 10.4,
            leading=18 if owner else 15,
            textColor=INK,
            spaceBefore=6,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=body_size,
            leading=body_leading,
            textColor=INK,
            wordWrap="CJK",
            spaceAfter=6,
        ),
        "body_bold": ParagraphStyle(
            "body_bold",
            parent=base["BodyText"],
            fontName="MalgunBold",
            fontSize=body_size,
            leading=body_leading,
            textColor=INK,
            wordWrap="CJK",
            spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=8.4 if owner else 7.8,
            leading=12.6 if owner else 11.5,
            textColor=MUTED,
            wordWrap="CJK",
        ),
        "table": ParagraphStyle(
            "table",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=9.6 if owner else 8.0,
            leading=14.5 if owner else 11.7,
            textColor=INK,
            wordWrap="CJK",
        ),
        "table_head": ParagraphStyle(
            "table_head",
            parent=base["BodyText"],
            fontName="MalgunBold",
            fontSize=9.3 if owner else 7.8,
            leading=13.5 if owner else 11.2,
            textColor=WHITE,
            alignment=TA_CENTER,
            wordWrap="CJK",
        ),
        "callout_title": ParagraphStyle(
            "callout_title",
            parent=base["BodyText"],
            fontName="MalgunBold",
            fontSize=11.8 if owner else 9.8,
            leading=17 if owner else 14,
            textColor=NAVY,
            spaceAfter=4,
        ),
        "callout_body": ParagraphStyle(
            "callout_body",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=10.5 if owner else 8.8,
            leading=16.5 if owner else 13.4,
            textColor=INK,
            wordWrap="CJK",
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=body_size,
            leading=body_leading,
            textColor=INK,
            wordWrap="CJK",
            leftIndent=0,
        ),
        "step_no": ParagraphStyle(
            "step_no",
            parent=base["BodyText"],
            fontName="MalgunBold",
            fontSize=11 if owner else 9,
            leading=16,
            textColor=WHITE,
            alignment=TA_CENTER,
        ),
        "code": ParagraphStyle(
            "code",
            parent=base["Code"],
            fontName="Courier",
            fontSize=8.0,
            leading=12,
            textColor=HexColor("#17233A"),
            leftIndent=4,
            wordWrap="LTR",
        ),
        "toc": ParagraphStyle(
            "toc",
            parent=base["BodyText"],
            fontName="Malgun",
            fontSize=11 if owner else 9.5,
            leading=18 if owner else 15,
            textColor=INK,
            leftIndent=4,
            spaceAfter=3,
        ),
    }
    return styles


def para(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(escape(text).replace("\n", "<br/>"), style)


def rich(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def h1(text: str, styles: dict[str, ParagraphStyle]) -> Paragraph:
    return para(text, styles["h1"])


def h2(text: str, styles: dict[str, ParagraphStyle]) -> Paragraph:
    return para(text, styles["h2"])


def h3(text: str, styles: dict[str, ParagraphStyle]) -> Paragraph:
    return para(text, styles["h3"])


def bullets(items: list[str], styles: dict[str, ParagraphStyle], color: colors.Color = BLUE) -> Table:
    rows = []
    for item in items:
        rows.append([
            rich("&#8226;", ParagraphStyle("dot", parent=styles["bullet"], fontName="MalgunBold", textColor=color, alignment=TA_CENTER)),
            para(item, styles["bullet"]),
        ])
    table = Table(rows, colWidths=[6 * mm, None], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 2),
        ("RIGHTPADDING", (1, 0), (1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def numbered_steps(items: list[str], styles: dict[str, ParagraphStyle]) -> Table:
    rows = []
    for index, item in enumerate(items, start=1):
        badge = Table([[para(str(index), styles["step_no"])]], colWidths=[7.5 * mm], rowHeights=[7.5 * mm])
        badge.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), BRAND),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        rows.append([badge, para(item, styles["body"])])
    table = Table(rows, colWidths=[11 * mm, None], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def callout(title: str, body: str, styles: dict[str, ParagraphStyle], tone: str = "blue") -> Table:
    palette = {
        "blue": (PALE_BLUE, BLUE),
        "pink": (PINK, BRAND),
        "gold": (PALE_GOLD, HexColor("#C78700")),
        "red": (PALE_RED, HexColor("#C64545")),
        "mint": (MINT, HexColor("#27866F")),
    }
    background, accent = palette[tone]
    cell = [para(title, styles["callout_title"]), para(body, styles["callout_body"])]
    table = Table([[cell]], colWidths=[None], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#E1E6EE")),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return table


def info_table(
    headers: list[str],
    rows: list[list[str]],
    widths: list[float],
    styles: dict[str, ParagraphStyle],
    header_color: colors.Color = NAVY,
    font_key: str = "table",
) -> Table:
    data = [[para(value, styles["table_head"]) for value in headers]]
    for row in rows:
        data.append([para(str(value), styles[font_key]) for value in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT", splitByRow=1)
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for index in range(1, len(data)):
        if index % 2 == 0:
            commands.append(("BACKGROUND", (0, index), (-1, index), PAPER))
    table.setStyle(TableStyle(commands))
    return table


def code_block(lines: list[str], styles: dict[str, ParagraphStyle]) -> Table:
    content = "<br/>".join(escape(line).replace(" ", "&nbsp;") for line in lines)
    table = Table([[Paragraph(content, styles["code"])]], colWidths=[None], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), HexColor("#F2F4F7")),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return table


def section_rule() -> Table:
    table = Table([[""]], colWidths=[None], rowHeights=[1.2 * mm])
    table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), BRAND)]))
    return table


def add_contents(story: list, items: list[str], styles: dict[str, ParagraphStyle]) -> None:
    story.extend([h1("차례", styles), section_rule(), Spacer(1, 5 * mm)])
    rows = []
    for index, item in enumerate(items, start=1):
        rows.append([
            para(f"{index:02d}", ParagraphStyle("toc_no", parent=styles["toc"], fontName="MalgunBold", textColor=BRAND, alignment=TA_RIGHT)),
            para(item, styles["toc"]),
        ])
    table = Table(rows, colWidths=[12 * mm, None])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, HexColor("#E9ECF1")),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([table, PageBreak()])


def cover(
    audience_label: str,
    title: str,
    subtitle: str,
    warning: str,
    styles: dict[str, ParagraphStyle],
) -> list:
    badge = Table([[para("하모니직업소개소", ParagraphStyle(
        "brand_badge", parent=styles["body_bold"], fontName="MalgunBold", fontSize=10, leading=14,
        textColor=WHITE, alignment=TA_CENTER,
    ))]], colWidths=[42 * mm], rowHeights=[10 * mm])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    meta = info_table(
        ["대상", "문서 기준", "읽는 시간"],
        [[audience_label, "2026-07-16 docs 전체", "약 20-30분"]],
        [55 * mm, 55 * mm, 45 * mm],
        styles,
        header_color=BRAND_DARK,
        font_key="small",
    )
    return [
        Spacer(1, 8 * mm),
        badge,
        Spacer(1, 18 * mm),
        para(audience_label, styles["cover_kicker"]),
        para(title, styles["cover_title"]),
        para(subtitle, styles["cover_subtitle"]),
        section_rule(),
        Spacer(1, 12 * mm),
        callout("먼저 확인하세요", warning, styles, "gold"),
        Spacer(1, 15 * mm),
        meta,
        Spacer(1, 14 * mm),
        para("이 PDF는 docs 폴더의 Markdown 13개를 모두 읽고 독자별로 재구성한 안내서입니다.", styles["small"]),
        PageBreak(),
    ]


SOURCE_ROWS = [
    ["S01", "adr/0001-mock-first-static-prototype.md", "초기 Mock 우선 결정과 금지사항"],
    ["S02", "compliance/mock-2026-submission-calendar.md", "사건별 기한, 연간 일정, 2년 보존"],
    ["S03", "compliance/mock-compliance-register.md", "준법 의무와 실제 확인 항목"],
    ["S04", "data/p0-data-dictionary.md", "데이터 모델, 최소수집, 상태와 보존"],
    ["S05", "field-audit/mock-field-audit-result.md", "현장실사 Mock, 역할 경계, 미확인 질문"],
    ["S06", "operations/mock-phone-visit-intake-pack.md", "전화·방문 질문과 양방향 안내"],
    ["S07", "roadmap/p0-progress.md", "P0 10개 상태와 P1 전환 게이트"],
    ["S08", "runbooks/mock-cloudflare-security-runbook.md", "Access, 키, 복구, 사고, 온라인 접수"],
    ["S09", "runbooks/mock-security-and-recovery.md", "초기 정적 Mock 안전수칙과 운영 게이트"],
    ["S10", "runbooks/p0-cloudflare-deployment-gates.md", "공개·내부 분리와 안전한 배포 순서"],
    ["S11", "security/mock-privacy-document-pack.md", "처리방침·동의·취급수칙·외부 AI"],
    ["S12", "security/mock-security-foundation.md", "JWT, RBAC, 암호화, 감사, 파기"],
    ["S13", "TEST-CASES.md", "자동화·현장·수동 검증 시나리오"],
]


def source_appendix(story: list, styles: dict[str, ParagraphStyle], developer: bool = False) -> None:
    story.extend([
        PageBreak(),
        h1("부록: 읽은 원문 13개와 반영 위치", styles),
        section_rule(),
        Spacer(1, 4 * mm),
        para("아래 파일을 빠짐없이 읽고 내용을 합치거나 독자에 맞게 다시 표현했습니다. 원문은 모두 Mock 또는 개발 단계 문서이며 법률 자문을 대신하지 않습니다.", styles["body"]),
        info_table(
            ["번호", "원문 파일", "이 PDF에서 사용한 내용"],
            SOURCE_ROWS,
            [13 * mm, 75 * mm if developer else 68 * mm, 86 * mm if developer else 93 * mm],
            styles,
            header_color=NAVY,
            font_key="small",
        ),
    ])


def owner_story(styles: dict[str, ParagraphStyle]) -> list:
    story: list = []
    story.extend(cover(
        "1인 직업소개소 사장님용",
        "하모니직업소개소\n업무 안내서",
        "전화 한 통을 받을 때부터 사람을 소개하고 장부를 남기는 일까지, 혼자 운영할 때 꼭 알아야 할 내용을 쉬운 말로 정리했습니다.",
        "여기에 적힌 날짜와 서식은 개발용 Mock 기준입니다. 실제 등록증, 보증보험, 교육일, 동작구 제출 방법을 확인한 뒤 운영 기준으로 확정해야 합니다. Mock 문서를 정부 제출용으로 사용하면 안 됩니다.",
        styles,
    ))
    add_contents(story, [
        "사장님이 맡는 일 한눈에 보기",
        "아침부터 마감까지 기본 순서",
        "일하실 분이 전화·방문했을 때",
        "식당에서 사람을 요청했을 때",
        "사람을 소개하기 전과 소개한 뒤",
        "하루·1개월·회원제 업무 차이",
        "소개요금과 장부",
        "개인정보를 안전하게 다루는 법",
        "제출·보험·교육·점검 일정",
        "문제가 생겼을 때 대처",
        "현재 홈페이지와 내부 시스템 상태",
        "개발자에게 확인해 줄 실제 정보",
        "한 장 체크리스트",
        "원문 13개 반영표",
    ], styles)

    story.extend([
        h1("1. 사장님이 맡는 일 한눈에 보기", styles),
        section_rule(), Spacer(1, 4 * mm),
        callout("가장 중요한 역할 구분", "소개소는 식당과 일하실 분의 조건을 확인하고 서로 연결하며 그 과정을 기록합니다. 근로계약, 현장 업무 지시, 안전 안내, 근무시간 확인, 임금 계산과 지급은 채용한 식당이 맡는 흐름으로 관리합니다.", styles, "pink"),
        Spacer(1, 4 * mm),
        info_table(
            ["소개소에서 할 일", "식당이 할 일"],
            [["구인·구직 접수", "근로계약 체결"], ["사업자와 근로조건 확인", "현장 업무 지시와 안전 안내"], ["후보 연락과 양쪽 조건 재확인", "근무시간 확인"], ["소개·취업·요금 장부 기록", "임금 계산과 직접 지급"]],
            [83 * mm, 83 * mm], styles, header_color=BRAND_DARK,
        ),
        Spacer(1, 5 * mm),
        h2("혼자 운영할 때 지켜야 할 네 가지", styles),
        bullets([
            "전화로 들은 조건을 바로 적고, 마지막에 상대방에게 다시 읽어 확인합니다.",
            "사업자·허가·임금·근무지 확인이 끝나지 않은 식당 요청은 사람에게 바로 전달하지 않습니다.",
            "근로계약 체결이 확인되기 전에는 소개요금을 청구하거나 장부에 수입으로 확정하지 않습니다.",
            "실제 개인정보와 원본 서류는 GitHub, 일반 메신저, 개인 클라우드에 올리지 않습니다.",
        ], styles),
        PageBreak(),
        h1("2. 아침부터 마감까지 기본 순서", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("문을 열 때", styles),
        bullets([
            "오늘 출근 예정자와 식당 이름, 시간, 주소를 확인합니다.",
            "빠진 근로조건이나 보건증 확인 만료가 있는지 봅니다.",
            "오늘이나 30일 안에 다가오는 보험·교육·점검 일정을 봅니다.",
            "휴대전화와 PC 화면 잠금이 켜져 있는지 확인합니다.",
        ], styles),
        h2("전화와 방문을 받을 때", styles),
        numbered_steps([
            "전화인지 방문인지 표시하고 상대방이 근로자인지 식당인지 구분합니다.",
            "접수표 순서대로 필요한 내용만 묻습니다.",
            "빠진 항목과 확인하지 못한 항목을 따로 표시합니다.",
            "조건을 다시 읽고 양쪽이 같은 내용을 이해했는지 확인합니다.",
            "소개 진행 상태를 후보, 연락 중, 소개, 계약 확인, 취업 또는 종료로 기록합니다.",
        ], styles),
        h2("하루를 마칠 때", styles),
        bullets([
            "출근·취업 결과와 취소·결근·조기퇴근 여부를 적습니다.",
            "계약이 확인된 건만 소개요금과 입금 날짜·방법을 기록합니다.",
            "종이 메모는 잠금 보관하고 책상이나 차량에 그대로 두지 않습니다.",
            "잘못 보낸 문자, 분실, 수상한 조회가 있으면 숨기지 말고 바로 사고 메모를 남깁니다.",
        ], styles),
        PageBreak(),
        h1("3. 일하실 분이 전화·방문했을 때", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("받아야 할 내용", styles),
        info_table(
            ["묻는 내용", "왜 필요한가"],
            [
                ["이름과 연락할 전화번호", "상담과 소개 연락"],
                ["생년월일", "장부와 18세 미만 여부 확인"],
                ["해보신 일과 원하는 일", "직종 맞춤"],
                ["가능한 날짜·시간·지역", "근무조건 맞춤"],
                ["원하는 임금과 이동 방법", "조건·이동 가능성 확인"],
                ["보건증 확인 상태·확인일·만료일", "식품취급 업무 확인. 검사 상세내용은 받지 않음"],
                ["취업 가능한 체류자격", "외국인인 경우 해당 업무 가능 여부 확인"],
                ["목적별 개인정보 동의", "수집·이용과 식당 제공을 따로 확인"],
            ],
            [68 * mm, 98 * mm], styles,
        ),
        Spacer(1, 4 * mm),
        callout("받지 않는 정보", "주민등록번호, 신분증 원본·사본, 보건증이나 건강진단의 상세 결과, 일과 관계없는 가족관계·종교·정치성향은 기본적으로 받지 않습니다.", styles, "red"),
        Spacer(1, 4 * mm),
        h2("일하실 분에게 알려드릴 내용", styles),
        bullets([
            "식당 이름과 실제 일할 주소",
            "하는 일, 날짜·기간, 시작·종료·휴게시간",
            "임금, 지급일, 지급방법",
            "식사·교통·복장 제공 여부와 안전 주의사항",
            "식당에 어떤 정보를 전달하는지와 동의 철회 방법",
            "소개 진행 상태와 소개요금이 있다면 계산 근거",
        ], styles),
        callout("선택정보는 따로", "이동수단과 긴급연락처 같은 선택정보는 필수정보와 분리합니다. 동의하지 않았다는 이유로 기본 상담을 거절하지 않습니다.", styles, "mint"),
        PageBreak(),
        h1("4. 식당에서 사람을 요청했을 때", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("식당에서 받아야 할 내용", styles),
        info_table(
            ["구분", "확인 항목"],
            [
                ["식당 정보", "상호, 대표자, 담당자, 전화, 사업장 주소"],
                ["사업 확인", "사업자등록번호, 업종, 영업허가번호"],
                ["사람 요청", "실제 근무지, 직종, 인원, 상세업무"],
                ["근무시간", "날짜·기간, 시작·종료, 휴게시간"],
                ["임금", "금액, 단위, 지급일, 지급방법"],
                ["지원·안전", "식사, 교통, 유니폼, 안전 주의사항"],
                ["검증", "사업자·허가·체불·최저임금 확인에 필요한 사실"],
            ],
            [42 * mm, 124 * mm], styles,
        ),
        Spacer(1, 4 * mm),
        callout("성별·나이 조건", "기본 접수 항목으로 받지 않습니다. 법적으로 정당한 이유가 확인되는 예외만 이유를 적고 별도로 검토합니다.", styles, "gold"),
        Spacer(1, 4 * mm),
        h2("식당에 알려야 할 내용", styles),
        bullets([
            "사업자·허가·근로조건을 확인하는 절차가 있다는 점",
            "허위 조건이나 최저임금 미달 조건은 진행할 수 없다는 점",
            "후보에게 전달할 근로조건 요약",
            "후보가 동의한 최소한의 정보만 식당에 전달한다는 점",
            "구인조건이 바뀌면 소개 전에 다시 알려야 한다는 점",
            "소개 확정 여부와 소개요금 계산 근거",
        ], styles),
        PageBreak(),
        h1("5. 사람을 소개하기 전과 소개한 뒤", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("소개하기 전 확인", styles),
        numbered_steps([
            "식당의 사업자, 허가, 체불 확인, 임금조건, 실제 근무지를 확인합니다.",
            "일하실 분의 날짜, 시간, 지역, 직종 경험, 희망임금, 보건증 상태를 대조합니다.",
            "식당 조건을 일하실 분에게 읽어드리고, 전달할 최소정보 동의를 확인합니다.",
            "식당에도 후보의 동의 범위 안에서 필요한 정보만 전달합니다.",
            "양쪽이 확인하면 소개 상태를 기록하고, 최종 결정은 사장님이 합니다.",
        ], styles),
        h2("소개한 뒤 기록", styles),
        bullets([
            "계약이 체결됐는지, 실제 취업·출근했는지",
            "계약기간과 임금, 변경된 조건",
            "소개요금 납부자·금액·날짜·방법",
            "취소, 결근, 대체인력, 조기종료, 환불 또는 분쟁",
            "누가 언제 상태를 바꾸었는지",
        ], styles),
        callout("상태는 순서대로", "후보 -> 연락 중 -> 소개 -> 계약 확인 -> 취업 또는 종료 순서로 기록합니다. 계약 확인이나 취업 상태가 되기 전에는 소개요금 장부를 확정하지 않습니다.", styles, "blue"),
        PageBreak(),
        h1("6. 하루·1개월·회원제 업무 차이", styles),
        section_rule(), Spacer(1, 4 * mm),
        info_table(
            ["유형", "특히 확인할 것", "마지막 기록"],
            [
                ["하루 근무", "당일 날짜, 시작·종료·휴게, 일급, 출근 여부", "소개 결과, 임금 확인, 요금"],
                ["1개월 근무", "계약 시작·종료일, 월임금, 지급일, 조건 변경", "취업 상태, 변경 이력, 요금"],
                ["회원제 일용", "회원 약정, 회비 기준, 가능한 날짜, 식당 요청", "회원명부, 소개기록, 회비 장부를 따로 기록"],
            ],
            [32 * mm, 72 * mm, 62 * mm], styles, header_color=BRAND_DARK,
        ),
        Spacer(1, 5 * mm),
        h2("현장에서 아직 확인해야 할 일", styles),
        bullets([
            "하루·월 근무의 실제 임금 지급일과 지급방법을 어떻게 확인하는지",
            "결근·조기퇴근·대체인력·사고·분쟁을 어떤 수첩이나 서식에 적는지",
            "현재 수첩에 법정 장부 필수항목이 빠짐없이 있는지",
            "18세 미만 동의와 외국인 취업 가능 체류자격을 실제로 어떻게 확인하는지",
        ], styles, BRAND),
        PageBreak(),
        h1("7. 소개요금과 장부", styles),
        section_rule(), Spacer(1, 4 * mm),
        callout("요금의 첫 번째 원칙", "근로계약 체결이 확인된 뒤에만 소개요금을 기록합니다. 현재 시스템의 금액과 상한은 Mock 설정값이므로 실제 운영 전 최신 고시와 서면계약 기준을 다시 확인해야 합니다.", styles, "gold"),
        Spacer(1, 5 * mm),
        h2("남겨야 할 장부", styles),
        info_table(
            ["장부", "주요 내용"],
            [
                ["종사자명부", "대표자와 종사자 현황"],
                ["구인접수대장", "식당, 구인조건, 접수일, 검증 결과"],
                ["구직접수·직업소개대장", "근로자, 희망조건, 소개처, 취업 결과, 요금"],
                ["일용근로자 회원명부", "회원 조건과 약정, 회비"],
                ["금전출납부", "소개요금·회비·환불·정정의 날짜와 금액"],
            ],
            [55 * mm, 111 * mm], styles,
        ),
        Spacer(1, 4 * mm),
        bullets([
            "Mock 시스템은 법정 장부에 들어간 자료의 완료일부터 2년 만료일을 계산합니다.",
            "일용근로자에게 일부 신청서가 면제될 수 있어도 구인·구직·소개·금전 기록은 남깁니다.",
            "기간별 PDF와 Excel 표본은 실제 장부 서식과 대조한 뒤 승인합니다.",
            "보존기간이 끝나도 분쟁이나 법적 보류가 있으면 바로 지우지 않습니다.",
        ], styles),
        PageBreak(),
        h1("8. 개인정보를 안전하게 다루는 법", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("상담할 때", styles),
        bullets([
            "일에 꼭 필요한 내용만 묻고, 필수정보와 선택정보를 구분합니다.",
            "식당 이름과 조건을 먼저 알려준 뒤 그 식당에 필요한 최소정보 제공 동의를 받습니다.",
            "공개 근로자 명단을 만들지 않습니다.",
            "외부 AI에는 실제 근로자·식당 원문을 보내지 않습니다.",
        ], styles),
        h2("보관할 때", styles),
        bullets([
            "공용계정을 쓰지 않고 휴대전화·PC 화면 잠금과 기기 암호화를 켭니다.",
            "업무에 필요한 기록만 열고, 대량 내보내기는 대표자 승인 기록을 남깁니다.",
            "종이 출력물은 잠금 보관하고 만료 후 분쇄합니다.",
            "GitHub 이슈, 일반 메신저, 개인 클라우드에 개인정보를 올리지 않습니다.",
        ], styles),
        h2("동의는 세 칸으로", styles),
        info_table(
            ["동의", "설명"],
            [["수집·이용", "상담과 소개에 필요한 기본정보"], ["식당 제공", "특정 식당에 제공할 최소정보"], ["선택정보", "이동수단·긴급연락처 등. 거절해도 기본 상담 가능"]],
            [48 * mm, 118 * mm], styles, header_color=BRAND_DARK,
        ),
        Spacer(1, 4 * mm),
        h2("1인 운영에서 계정을 나누는 방법", styles),
        bullets([
            "평소 업무는 사장님 개인 owner 계정 하나로 사용하고 공용계정은 만들지 않습니다.",
            "staff 계정은 실제 종사자가 생길 때만 만들고 퇴사·업무변경 즉시 중지합니다.",
            "개발·복구용 system_admin은 평소 근로자 자료를 볼 수 없게 유지합니다.",
            "파기 실행자와 검증자를 한 사람이 모두 맡기 어려우므로 개발자나 별도 확인자의 승인 절차를 정합니다.",
        ], styles),
        callout("실수했을 때", "잘못 보냈거나 휴대전화를 잃어버렸거나 수상한 접근을 발견하면 숨기지 않습니다. 계정을 멈추고, 언제 무엇이 노출됐을 가능성이 있는지 개인정보 원문 없이 기록한 뒤 개발자와 관계기관 확인 절차를 시작합니다.", styles, "red"),
        PageBreak(),
        h1("9. 제출·보험·교육·점검 일정", styles),
        section_rule(), Spacer(1, 4 * mm),
        callout("중요", "아래 날짜는 docs에 반영된 Mock 계산 규칙입니다. 실제 기준과 제출방법은 동작구 최신 안내, 등록증, 보험증권, 교육 수료증으로 확인해야 합니다.", styles, "gold"),
        Spacer(1, 5 * mm),
        h2("무언가 바뀌거나 생겼을 때", styles),
        info_table(
            ["사건", "Mock 기한", "준비할 것"],
            [
                ["상호·위치·대표자·종사자·겸업 변경", "발생일부터 30일", "변경등록 신청서와 증빙"],
                ["보증보험 갱신", "갱신일부터 10일", "갱신 증권과 제출 확인"],
                ["보험금 지급으로 한도 부족", "발생일부터 7일", "보충 증권과 납입 증빙"],
                ["폐업", "폐업일부터 7일", "폐업신고서와 등록증"],
            ],
            [69 * mm, 34 * mm, 63 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        h2("매년 반복해서 확인", styles),
        info_table(
            ["시기", "할 일", "원본 확인"],
            [["6월 30일", "상반기 자체점검", "동작구 최신 점검표"], ["9월 30일", "연 4시간 교육 확인", "2026 교육일정·수료증"], ["12월 31일", "하반기 자체점검", "점검 결과 반영"], ["보험 만료 전", "만료일까지 갱신", "실제 보험 만료일"]],
            [35 * mm, 61 * mm, 70 * mm], styles, header_color=BRAND_DARK,
        ),
        Spacer(1, 4 * mm),
        h2("지금 원본으로 확인해야 할 다섯 가지", styles),
        bullets([
            "직업소개사업 등록증의 현재 상호·주소·대표자·종사자",
            "보증보험 증권번호·가입금액·만료일",
            "최근 교육 수료일과 2026 교육일정",
            "동작구의 정기 보고 관행과 최신 제출 서식",
            "실제 운영시간·휴무일과 현재 사용하는 장부 서식",
        ], styles, BRAND),
        PageBreak(),
        h1("10. 문제가 생겼을 때 대처", styles),
        section_rule(), Spacer(1, 4 * mm),
        info_table(
            ["상황", "먼저 할 일", "남길 기록"],
            [
                ["휴대전화·PC 분실", "계정 중지, 세션 해제, 기기 잠금·초기화 검토", "분실 시각, 기기, 가능 노출범위"],
                ["수상한 로그인", "Access/IdP 계정 중지, 비밀번호·MFA 재설정", "실패·성공 시각, 조회·내보내기 확인"],
                ["잘못 보낸 문자·파일", "수신자에게 삭제 요청, 추가 전송 중지", "보낸 항목과 대상, 회수 여부"],
                ["조건·요금 분쟁", "원래 접수내용과 변경 이력 확인", "양쪽 통화시각, 계약·임금·요금 근거"],
                ["사고·결근·대체", "식당과 근로자에게 사실 확인", "발생시각, 조치, 최종 소개결과"],
            ],
            [39 * mm, 70 * mm, 57 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        callout("개인정보 사고 메모 원칙", "이슈나 메신저에 이름, 전화번호, 신분증, 건강정보 원문을 붙이지 않습니다. 내부 번호, 시각, 행동, 건수, 결과만 기록합니다.", styles, "red"),
        PageBreak(),
        h1("11. 현재 홈페이지와 내부 시스템 상태", styles),
        section_rule(), Spacer(1, 4 * mm),
        info_table(
            ["구분", "현재 가능한 것", "아직 하면 안 되는 것"],
            [
                ["공개 홍보 페이지", "주소·서비스·전화·사진 안내. 누구나 볼 수 있음", "개인정보 입력, 공개 근로자 명단, 온라인 접수"],
                ["내부 업무 Mock", "합성 식당·근로자, 접수·매칭·장부·일정 흐름 검증", "실제 사람·식당 정보 입력, 운영 시스템으로 오해해 공개"],
                ["내부 Worker 기반", "Access JWT·역할·암호화·감사·D1 구조의 코드 검증", "실제 계정·D1·비밀키 없이 운영 배포"],
            ],
            [42 * mm, 64 * mm, 60 * mm], styles, header_color=BRAND_DARK,
        ),
        Spacer(1, 5 * mm),
        callout("온라인 접수는 계속 꺼 둡니다", "목적별 동의문, Turnstile, 서버 검증, 요청 크기·민감정보 차단, 공개 코드의 D1 읽기 차단을 모두 확인하기 전에는 INTAKE_ENABLED=false를 유지합니다.", styles, "blue"),
        Spacer(1, 5 * mm),
        para("공개된 문의전화와 사진은 사용자가 공개를 승인한 상태지만, 등록증 원본 확인과는 별개입니다. 특히 0003.png에는 전화번호와 계좌정보가 포함되어 있으므로 공개 필요성을 주기적으로 다시 확인하는 것이 안전합니다.", styles["body"]),
        PageBreak(),
        h1("12. 개발자에게 확인해 줄 실제 정보", styles),
        section_rule(), Spacer(1, 4 * mm),
        callout("원본을 GitHub에 올리지 마세요", "사장님이 원본을 직접 보면서 항목별 사실만 개발자와 확인합니다. 샘플이 꼭 필요하면 이름·번호·계좌·서명을 완전히 가린 사본만 사용합니다.", styles, "red"),
        Spacer(1, 5 * mm),
        info_table(
            ["확인할 것", "사장님이 알려줄 내용"],
            [
                ["등록 상태", "등록증의 상호·주소·대표자·종사자·확인일"],
                ["보증보험", "가입금액·만료일·갱신일. 증권번호 원문은 별도 보관"],
                ["교육", "대표자·종사자의 최근 수료일과 수료증 존재 여부"],
                ["영업", "운영시간, 휴무일, 실제 종사자 유무"],
                ["업무흐름", "하루·1개월·회원제 통화 1건씩의 개인정보 가림 메모"],
                ["장부", "현재 수첩·서식의 항목명과 실제 보관방법"],
                ["예외상황", "취소·결근·대체·조기종료·환불·사고·분쟁 처리 방법"],
            ],
            [48 * mm, 118 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        h2("개발자와 함께 통화 3건을 확인할 때", styles),
        bullets([
            "개인정보를 가리고 질문 순서만 확인합니다.",
            "사장님이 평소 쓰는 말로 화면 문구가 읽히는지 봅니다.",
            "빠진 정보와 잘 묻지 않는 정보를 표시합니다.",
            "컴퓨터가 추천해도 최종 소개는 사장님이 결정하는지 확인합니다.",
        ], styles),
        PageBreak(),
        h1("13. 한 장 체크리스트", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("식당 전화", styles),
        bullets(["[ ] 식당·담당자·사업자·허가 확인", "[ ] 근무지·직종·인원·업무 확인", "[ ] 날짜·시간·휴게·임금·지급일 확인", "[ ] 체불·최저임금·허위조건 확인", "[ ] 근로조건을 다시 읽어 확인"], styles, BRAND),
        h2("근로자 전화", styles),
        bullets(["[ ] 이름·전화·생년월일", "[ ] 원하는 일·가능 날짜·시간·지역·임금", "[ ] 보건증은 상태·확인일·만료일만", "[ ] 수집·이용과 식당 제공 동의를 각각 확인", "[ ] 주민등록번호·신분증·건강 상세결과는 받지 않음"], styles, BLUE),
        h2("소개 후", styles),
        bullets(["[ ] 양쪽 최종 조건 확인", "[ ] 계약 확인과 취업 결과 기록", "[ ] 계약 확인 뒤에만 소개요금 기록", "[ ] 금전장부와 2년 보존일 등록", "[ ] 취소·결근·변경·환불이 있으면 이력 기록"], styles, HexColor("#27866F")),
        h2("매달 한 번", styles),
        bullets(["[ ] 다음 30일 보험·교육·점검 일정", "[ ] 만료 예정 개인정보와 법적 보류", "[ ] 휴대전화·PC 계정과 잠금", "[ ] 종이 출력물·수첩 잠금 보관", "[ ] 실제 기준 미확인 항목을 개발자와 점검"], styles, HexColor("#C78700")),
    ])
    source_appendix(story, styles, developer=False)
    story.extend([
        Spacer(1, 6 * mm),
        callout("마지막 확인", "이 안내서는 사장님이 업무를 정리하기 위한 Mock 요약입니다. 실제 법정 제출, 소개요금, 개인정보 문서, 보험·교육 기준은 최신 원본과 관할기관 확인을 우선합니다.", styles, "gold"),
    ])
    return story


def developer_story(styles: dict[str, ParagraphStyle]) -> list:
    story: list = []
    story.extend(cover(
        "개발자·운영 설계자용",
        "하모니직업소개소\n개발·운영 가이드",
        "docs의 설계 결정, 데이터 모델, 업무 규칙, 보안, Cloudflare 배포 게이트, 테스트와 남은 P0 과제를 한 문서로 통합했습니다.",
        "문서 집합에는 초기 정적 Mock 단계와 이후 공개·내부 분리 단계가 함께 있습니다. 이 PDF는 최신 문서를 우선해 현재 상태를 해석하며, 법률·현장 사실과 운영 Cloudflare 설정은 아직 확정되지 않았습니다.",
        styles,
    ))
    add_contents(story, [
        "문서 해석과 현재 기준선",
        "시스템 경계와 배포 구조",
        "데이터 모델과 보존",
        "접수·소개·요금 업무 규칙",
        "개인정보 문서와 최소수집",
        "인증·권한·암호화·감사",
        "백업·복구·사고 대응",
        "Cloudflare 운영 전환",
        "테스트 전략과 누락 시나리오",
        "P0 상태와 P1 전환 게이트",
        "개발 우선순위와 리스크",
        "출시 체크리스트",
        "원문 13개 반영표",
    ], styles)

    story.extend([
        h1("1. 문서 해석과 현재 기준선", styles),
        section_rule(), Spacer(1, 4 * mm),
        para("docs에는 2026-07-15의 초기 정적 Mock 결정과 2026-07-16의 내부 Worker 보안 기반이 함께 있다. 최신 상태는 공개 Pages와 내부 Worker가 분리되어 있고, 실제 개인정보는 여전히 금지되며, 운영 Access/D1/Secrets는 설정되지 않은 Mock 단계다.", styles["body"]),
        info_table(
            ["문서군", "기준 시점", "해석"],
            [
                ["S01 ADR", "초기 프로토타입", "한 정적 앱 결정은 역사적 기준. 현재 분리 구조와 충돌하므로 후속 ADR 필요"],
                ["S09 초기 복구 운영서", "인증·DB 없음", "정적 내부 Mock 기준. 현재 Worker 보안 코드보다 이전 상태"],
                ["S04·S07·S08·S10·S12", "현재 P0 Mock", "Access JWT, RBAC, D1, 암호화, 감사, 분리 배포를 최신 기준으로 사용"],
                ["S02·S03·S05·S06·S11·S13", "업무·준법·검증", "Mock 규칙을 제공하지만 실제 원본·관할기관 확인 필요"],
            ],
            [43 * mm, 37 * mm, 86 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        callout("문서 부채", "새 ADR을 작성해 S01의 '한 정적 애플리케이션' 결정을 공개 Pages + 내부 Worker 구조로 대체하고, S09의 '인증·DB 없음' 설명을 역사적 상태로 명시해야 한다.", styles, "gold"),
        Spacer(1, 5 * mm),
        h2("불변 안전 원칙", styles),
        bullets([
            "실제 근로자·식당·등록증·보험·수첩 원문을 Mock, 저장소, 이슈에 넣지 않는다.",
            "Mock 문서를 실제 제출·보험·교육·점검 증빙으로 사용하지 않는다.",
            "공개 페이지는 개인정보를 받거나 내부 Worker를 노출하지 않는다.",
            "실제 운영 승인이 나기 전 DATA_MODE=mock, INTAKE_ENABLED=false를 유지한다.",
        ], styles),
        PageBreak(),
        h1("2. 시스템 경계와 배포 구조", styles),
        section_rule(), Spacer(1, 4 * mm),
        info_table(
            ["경계", "공개 홍보 사이트", "내부 업무 Worker"],
            [
                ["코드", "apps/public-site", "apps/ops-app"],
                ["Cloudflare", "Pages: harmony-work", "Worker: harmony-ops"],
                ["접근", "누구나", "Access 허용 사용자"],
                ["데이터", "조회·저장 없음", "D1 DB 바인딩"],
                ["온라인 접수", "없음", "쓰기 경로도 운영 전 비활성"],
                ["개인정보", "받지 않음", "현재 Mock 형식만 허용"],
            ],
            [31 * mm, 68 * mm, 67 * mm], styles, header_color=BRAND_DARK,
        ),
        Spacer(1, 6 * mm),
        callout("다중 방어선", "주소 비공개에 의존하지 않는다. Cloudflare Access 정책, Worker의 Cf-Access-Jwt-Assertion 재검증, D1 내부 사용자 활성 상태, 앱 RBAC를 모두 통과해야 한다.", styles, "blue"),
        Spacer(1, 5 * mm),
        h2("현재와 목표", styles),
        info_table(
            ["항목", "현재", "운영 목표"],
            [
                ["공개 홈페이지", "배포됨, 폼 없음", "홍보 전용 유지"],
                ["내부 UI", "정적 Mock + Worker 기반 코드", "Access 보호 내부 도메인"],
                ["데이터", "합성 데이터·로컬 D1", "preview/production D1 분리"],
                ["문서", "Mock JSON", "암호화 객체저장 + 접근감사"],
                ["접수", "전화·방문 운영자 입력", "안정화 후 Turnstile 공개 접수 검토"],
            ],
            [35 * mm, 57 * mm, 74 * mm], styles,
        ),
        PageBreak(),
        h1("3. 데이터 모델과 보존", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("핵심 관계", styles),
        code_block([
            "Restaurant -> JobRequest -> Placement <- Worker",
            "Worker -> Consent",
            "Placement -> PlacementStatusHistory",
            "Placement -> FeeTransaction -> LedgerEntry",
            "ComplianceEvent -> DocumentRef",
            "AppPrincipal -> AuditEvent",
            "RetentionItem -> destruction workflow",
        ], styles),
        Spacer(1, 5 * mm),
        info_table(
            ["엔터티", "책임", "핵심 보존"],
            [
                ["Restaurant", "식당 신원·검증", "일반 접수 1년 Mock, 장부 편입 시 완료일부터 2년"],
                ["Worker", "구직 상담·연락", "일반 접수 1년 Mock, 장부 편입 시 완료일부터 2년"],
                ["JobRequest", "근무조건", "구인대장으로 완료일부터 2년"],
                ["Placement", "소개·취업 결과", "소개대장으로 완료일부터 2년"],
                ["Consent", "목적별 동의·철회", "처리 종료와 법정 보존 기준 연계"],
                ["FeeTransaction·LedgerEntry", "요금 검증·금전장부", "발생·완료일부터 2년"],
                ["AuditEvent", "누가 무엇을 했는지", "원문 PII 금지, 운영 보존정책 미확정"],
                ["RetentionItem", "만료·legal hold·파기", "파기 증빙과 함께 상태 전이"],
            ],
            [43 * mm, 55 * mm, 68 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        h2("PII 등급과 저장 원칙", styles),
        bullets([
            "전화번호, 사업자번호, 주소, 접수 payload는 앱 수준 필드 암호화 대상이다.",
            "보건증 원문이 아니라 status, checkedOn, expiresOn만 저장한다.",
            "주민등록번호·신분증 원본/사본·건강 상세결과는 schema/validator 수준에서 금지한다.",
            "Audit detail에는 requestId, record ID, resultCode, changed field, count만 허용한다.",
            "legal_hold=1이면 만료되어도 자동 파기 후보에서 제외한다.",
        ], styles),
        h2("API 기능군과 migration 기준", styles),
        info_table(
            ["영역", "기능·기준"],
            [
                ["Session", "내부 사용자와 data mode 확인"],
                ["Compliance", "연간 calendar 조회, 사건 발생일 등록과 due date 계산"],
                ["Intake", "restaurant/worker 전화·방문 접수, restaurant 조건 preview"],
                ["Placement", "소개 생성과 허용된 상태 변경"],
                ["Fee·Ledger", "계약 확인 뒤 요금 검증과 금전장부 생성"],
                ["Records", "근로자 최소 목록·상세, owner 전용 요약 export"],
                ["Security", "audit 조회, retention 파기 실행"],
                ["Migration 0001", "principal·restaurant·worker·job·placement·consent·fee·audit·retention"],
                ["Migration 0002", "합성 seed"],
                ["Migration 0003", "placement history·ledger·compliance events"],
            ],
            [43 * mm, 123 * mm], styles,
        ),
        PageBreak(),
        h1("4. 접수·소개·요금 업무 규칙", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("Restaurant intake", styles),
        bullets([
            "신원: 상호·대표자·담당자·전화·사업자/허가번호·주소",
            "JobRequest: 직종·인원·기간·시작/종료·휴게·임금 단위/금액·지급일/방법·상세업무",
            "운영: 식사·교통·유니폼·안전사항",
            "검증 blockers: 사업자, 허가, 체불, 최저임금, 근무지",
            "검증된 입력에서 worker condition summary를 생성한다.",
        ], styles),
        h2("Worker intake", styles),
        bullets([
            "기본: 이름/가명·전화·생년월일·희망직종·가능 날짜/시간·지역·경력·희망임금",
            "조건: 이동수단, 외국인 취업 가능 체류자격, 보건증 상태·확인일·만료일",
            "18세 미만은 친권자·후견인 취업동의 gate",
            "동의는 collection-use, restaurant-provision, optional-information으로 분리",
            "선택정보 거절은 기본 상담을 차단하지 않는다.",
        ], styles),
        h2("Placement state machine", styles),
        code_block([
            "candidate -> contacting -> introduced",
            "introduced -> contract_confirmed | closed",
            "contract_confirmed -> employed | closed",
            "employed -> closed",
            "fee allowed only in contract_confirmed or employed",
        ], styles),
        Spacer(1, 5 * mm),
        callout("법적·운영 경계", "소개소는 접수·검증·후보 연락·양측 확인·장부를 담당한다. 식당은 근로계약, 현장 지휘·안전, 근로시간, 임금 계산·지급의 주체다. 공급·직접지휘 형태가 되지 않도록 UX와 데이터 상태를 설계한다.", styles, "pink"),
        PageBreak(),
        h1("5. 개인정보 문서와 최소수집", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("운영 전 확정할 문서", styles),
        info_table(
            ["문서", "필수 내용"],
            [
                ["개인정보 처리방침", "목적, 필수/선택, 제공, 보존 시작점·기간, 파기, 위탁/국외이전, 권리요청, 담당자"],
                ["수집·이용 동의", "구직상담·소개에 필요한 최소 항목과 거부 영향"],
                ["식당 제공 동의", "특정 식당, 제공 항목·목적·시점·버전"],
                ["선택정보 동의", "이동수단·긴급연락처, 거절해도 기본상담 가능"],
                ["권한 신청·회수", "내부 ID, 역할, 필요업무, 승인자, 시작·재검토·회수일"],
                ["외부 AI/위탁 점검", "처리업체·위치·학습사용·가명화·재위탁·삭제·사고통지"],
            ],
            [48 * mm, 118 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        callout("외부 AI 원칙", "학습 사용 거부, 전달 필드 최소화·가명화, 보존·삭제, 재위탁, 사고통지 조건을 확인할 수 없으면 실제 근로자·식당 원문을 외부 모델에 전달하지 않는다.", styles, "red"),
        Spacer(1, 5 * mm),
        h2("자료 취급", styles),
        bullets([
            "실제 문서 샘플은 사본을 만든 뒤 이름·번호·계좌·서명을 완전히 가린다.",
            "원본은 GitHub에 올리지 않고 확인일·확인자·원본 종류만 verification record로 남긴다.",
            "Mock -> 확인 대기 -> 원본 확인 상태를 분리한다.",
            "공개 0003.png에는 전화번호와 계좌정보가 포함된다. 사용자 승인 상태와 위험 수용을 별도로 기록하고 주기적으로 재확인한다.",
        ], styles),
        PageBreak(),
        h1("6. 인증·권한·암호화·감사", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("Access JWT 검증", styles),
        numbered_steps([
            "Cf-Access-Jwt-Assertion의 RS256 서명과 kid를 Access 공개키로 확인한다.",
            "iss가 지정한 Access team domain인지 확인한다.",
            "aud가 내부 application AUD인지 확인한다.",
            "exp와 nbf 시간 유효성을 확인한다.",
            "sub가 D1 app_principals의 active 사용자와 연결되는지 확인한다.",
        ], styles),
        para("이메일 헤더나 사용자 제공 헤더를 권한 판단에 사용하지 않는다. MFA와 session duration은 Access/IdP에서 강제하고 별도 증빙을 남긴다.", styles["body"]),
        h2("RBAC", styles),
        info_table(
            ["작업", "owner", "staff", "system_admin"],
            [
                ["업무 대시보드", "허용", "허용", "허용"],
                ["목록·상세", "허용", "허용", "금지"],
                ["접수 수정", "허용", "허용", "금지"],
                ["내보내기", "허용", "금지", "금지"],
                ["감사로그", "허용", "금지", "허용"],
                ["파기", "허용", "금지", "금지"],
                ["권한 변경", "허용", "금지", "허용"],
                ["백업·복구", "허용", "금지", "허용"],
            ],
            [70 * mm, 32 * mm, 32 * mm, 32 * mm], styles, header_color=BRAND_DARK,
        ),
        Spacer(1, 5 * mm),
        h2("암호화와 키", styles),
        bullets([
            "PII는 AES-256-GCM, audit chain은 별도 HMAC key를 사용한다.",
            "record/field context를 additional authenticated data로 묶는다.",
            "ciphertext에는 key ID만 저장하고 key value는 Workers Secrets에 둔다.",
            "PII_ENCRYPTION_KEY와 AUDIT_HMAC_KEY는 서로 다른 32바이트 이상 난수다.",
            "rotation은 Mock 복제본에서 decrypt -> re-encrypt -> count verification 후 승인한다.",
        ], styles),
        h2("감사와 탐지", styles),
        bullets([
            "이벤트는 previous hash + HMAC으로 연결하고 UPDATE/DELETE를 D1 trigger로 차단한다.",
            "모든 export, 권한변경, 파기와 50건 이상 조회를 탐지 대상으로 둔다.",
            "10분 반복 Access 실패, 업무시간 밖 상세조회, hash chain mismatch를 알림 후보로 둔다.",
        ], styles),
        PageBreak(),
        h1("7. 백업·복구·사고 대응", styles),
        section_rule(), Spacer(1, 4 * mm),
        callout("초기 목표", "RPO 24시간, RTO 4시간은 Mock 초안이다. 실제 D1 요금제와 Time Travel 보존기간을 실행 당일 공식 문서에서 확인한 뒤 확정한다.", styles, "gold"),
        Spacer(1, 5 * mm),
        h2("복구 훈련", styles),
        numbered_steps([
            "복구 전 장부·요금 건수와 합계, 최신 audit hash를 기록한다.",
            "운영 DB를 덮지 않고 별도 recovery DB로 지정 시점 복원한다.",
            "migration version과 주요 table counts를 비교한다.",
            "요금 합계와 audit hash chain을 검증한다.",
            "권한 있는 시험 계정으로 최소 조회만 확인한다.",
            "RPO/RTO와 불일치를 기록한 뒤 recovery DB를 파기한다.",
        ], styles),
        h2("계정탈취·기기분실", styles),
        bullets([
            "Access/IdP 계정 중지와 active session 무효화",
            "app_principals.active=0 및 revoke timestamp 기록",
            "해당 actor의 조회·export·role change 감사 확인",
            "실제 PII 없이 노출 범위와 사건 timeline 기록",
            "신고·통지는 개인정보 책임자와 관계기관 기준으로 판단",
            "기기 초기화, key/password rotation, 재교육 후 재승인",
        ], styles),
        PageBreak(),
        h1("8. Cloudflare 운영 전환", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("필수 gate", styles),
        bullets([
            "production account/domain 확정, preview와 production D1 분리",
            "Access self-hosted application, default deny, owner/staff allow, MFA",
            "ACCESS_TEAM_DOMAIN, ACCESS_AUD를 환경별 일반 변수로 설정",
            "PII_ENCRYPTION_KEY, PII_KEY_CURRENT_ID, AUDIT_HMAC_KEY, AUDIT_KEY_ID를 Secrets로 설정",
            "preview D1에 migration 적용 후 하루·1개월·회원제 Mock 회귀 테스트",
            "Workers Logs에 PII 원문이 없는지 확인",
            "backup/restore/destruction 훈련 완료",
            "운영 승인 전 DATA_MODE=mock, INTAKE_ENABLED=false 유지",
        ], styles),
        h2("안전한 로컬 검증 순서", styles),
        code_block([
            "npm.cmd run check:p0",
            "npm.cmd run lint",
            "npm.cmd test",
            "wrangler d1 migrations apply harmony-ops-mock --local -c apps/ops-app/wrangler.mock.jsonc",
            "wrangler deploy --dry-run -c apps/ops-app/wrangler.mock.jsonc",
        ], styles),
        Spacer(1, 5 * mm),
        h2("온라인 접수 활성화 조건", styles),
        info_table(
            ["조건", "검증"],
            [
                ["동의문", "목적별 수집·제공·선택정보 문구 확정"],
                ["Turnstile", "site key/secret 분리, Siteverify server 검증"],
                ["토큰", "hostname/action 확인, replay 차단"],
                ["payload", "size, allowlist, restricted pattern 차단"],
                ["public boundary", "public code에 D1 read path 없음"],
                ["실패 처리", "전화 안내만 하고 request body를 log에 남기지 않음"],
            ],
            [48 * mm, 118 * mm], styles,
        ),
        PageBreak(),
        h1("9. 테스트 전략과 누락 시나리오", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("현재 자동화된 범위", styles),
        bullets([
            "계약 확인 전 소개요금 차단과 Mock 상한",
            "사업자 미확인·임금 미달·체불 미확인 구인 차단",
            "주민등록번호 패턴과 신분증/건강 상세 문구 탐지",
            "날짜·직종·지역·희망임금·보건증 기반 후보 정렬",
            "준법 D-day와 위험도",
            "공개 페이지의 전화·폼 없음·보안 헤더",
            "모든 Mock JSON의 mock=true와 warning",
            "현장실사·사업자증·3개 업무 흐름 구조와 공개승인/원본확인 분리",
        ], styles),
        h2("현장 확인 뒤 수동 검증", styles),
        info_table(
            ["시나리오", "검증할 결과"],
            [
                ["하루 근무", "접수 -> 소개 -> 계약 -> 출근 -> 요금 -> 장부"],
                ["1개월 근무", "월임금·계약기간·지급일·요금·변경"],
                ["회원제 일용", "회원명부·회비·소개기록 분리"],
                ["예외", "취소·결근·대체·조기종료·환불"],
                ["자격", "외국인 취업 가능 체류자격, 18세 미만 보호자 동의"],
                ["보존", "2년 전 파기 차단, 만료 후 복구 불가능한 파기"],
                ["AI", "운영자 거절·수정과 결정 감사기록"],
            ],
            [45 * mm, 121 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        callout("추가할 테스트", "state transition negative cases, idempotent intake race, consent withdrawal, fee refund/adjustment, key rotation, audit chain tampering, Access session expiry, backup restore parity, public asset PII scan을 다음 테스트 묶음으로 권장한다.", styles, "blue"),
        PageBreak(),
        h1("10. P0 상태와 P1 전환 게이트", styles),
        section_rule(), Spacer(1, 4 * mm),
        info_table(
            ["이슈", "Mock 상태", "실제 완료 조건"],
            [
                ["#1 데이터·개인정보", "구현", "처리방침·동의문·최소수집 승인"],
                ["#4 준법 캘린더", "구현", "원본·동작구 답변·최신 서식"],
                ["#5 현장 실사", "Mock 준비", "방문·수첩 가림 대조·운영시간"],
                ["#6 식당 접수", "구현", "실제 필드·최저임금·사업 검증"],
                ["#7 근로자 접수", "구현", "동의문·접근권한 승인"],
                ["#8 장부·요금", "구현", "실제 장부·출력표본 승인"],
                ["#9 보안", "기반 구현", "IdP/MFA·keys·backup·access review"],
                ["#13 실행계획", "진행 중", "P0 gate 충족 후 P1 승인"],
                ["#14 전화·방문", "구현", "실제 통화 3건 관찰"],
                ["#15 분리 배포", "기반 구현", "D1·Access·MFA·Secrets·domain"],
            ],
            [24 * mm, 31 * mm, 111 * mm], styles,
        ),
        Spacer(1, 5 * mm),
        h2("P1 전환 전 필수", styles),
        numbered_steps([
            "등록·보험·교육·종사자 현황을 원본으로 확인한다.",
            "전화·방문 상담 3개를 PII를 가린 메모로 관찰해 field contract를 수정한다.",
            "privacy notice, provision scope, retention을 운영 기준으로 승인한다.",
            "Access default deny, allowed users, MFA, D1, keys, backup/restore를 실제 계정에서 검증한다.",
            "하루·1개월·회원제 사례의 PDF/Excel 승인 표본을 확인한다.",
        ], styles),
        PageBreak(),
        h1("11. 개발 우선순위와 리스크", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("권장 실행 순서", styles),
        numbered_steps([
            "ADR과 초기 보안 문서를 현재 분리 구조로 갱신한다.",
            "현장 원본 verification record와 실제 통화 3건으로 schema gaps를 닫는다.",
            "법정 장부·privacy docs·fee rules를 최신 공식 기준과 대조해 versioning한다.",
            "preview Access/D1/Secrets를 구성하고 migration·RBAC·audit를 통합 테스트한다.",
            "backup/restore/key rotation/access revocation 훈련을 수행한다.",
            "내부 UI를 운영자 언어로 연결하고 PDF/Excel 표본을 승인받는다.",
            "운영 안정화 후에만 Turnstile 기반 공개 접수를 별도 release로 검토한다.",
        ], styles),
        h2("리스크 레지스터", styles),
        info_table(
            ["리스크", "영향", "대응"],
            [
                ["Mock 법규를 실제로 오인", "제출·요금·보존 오류", "official source와 동작구 확인, rule version"],
                ["문서 시점 충돌", "아키텍처 오해", "후속 ADR, historical banner"],
                ["공개 자산의 계좌정보", "불필요 정보 노출", "승인·위험수용 기록, 정기 재확인"],
                ["실제 동의문 미확정", "PII 처리 부적합", "INTAKE_ENABLED=false 유지"],
                ["Access/D1/Secrets 미구성", "내부 운영 불가", "preview부터 gate별 증빙"],
                ["audit/backup 미실증", "사고·복구 증명 부족", "tamper·restore drill"],
                ["예외 업무 미모델링", "현장 우회·수기 회귀", "취소·환불·대체 시나리오"],
                ["TEST-CASES 전화 문구 충돌", "공개 전화번호 검증 오해", "승인된 사업용 전화만 허용, 개인정보 form 금지로 수정"],
                ["ComplianceTask/Event 중복", "준법 일정 이중 기록", "단일 모델 선택, migration·backfill 계획"],
                ["생년월일 최소수집 미확정", "과다수집 또는 미성년 gate 오류", "전체 생년월일과 성인여부 중 운영 기준 확정"],
                ["1인 운영 역할 분리", "파기·복구 검증 독립성 부족", "owner와 개발관리자 경계, 비상접근·2차 확인 정의"],
            ],
            [46 * mm, 46 * mm, 74 * mm], styles,
        ),
        PageBreak(),
        h1("12. 출시 체크리스트", styles),
        section_rule(), Spacer(1, 4 * mm),
        h2("법무·현장", styles),
        bullets(["[ ] 등록증·사업자증·보험·교육 원본 대조", "[ ] 운영시간·종사자·수첩 field 확인", "[ ] 동작구 제출/교육 관행 확인", "[ ] 최신 fee·ledger·retention 기준 version 기록"], styles, BRAND),
        h2("개인정보", styles),
        bullets(["[ ] privacy notice와 3개 consent 승인", "[ ] restricted fields negative test", "[ ] redacted sample만 사용", "[ ] 외부 AI/processor checklist 승인"], styles, BLUE),
        h2("Cloudflare·보안", styles),
        bullets(["[ ] preview/production D1 분리", "[ ] Access default deny + allowed user + MFA", "[ ] env vars와 4개 Secrets", "[ ] JWT/RBAC/export/destruction denial test", "[ ] audit logs에 PII 없음", "[ ] backup/restore/key rotation/revocation drill"], styles, HexColor("#27866F")),
        h2("제품·QA", styles),
        bullets(["[ ] 3개 핵심 시나리오 end-to-end", "[ ] 예외 6종과 자격/미성년", "[ ] PDF/Excel 표본 승인", "[ ] 모바일 운영자 UX 확인", "[ ] public site에 form/internal link/D1 read 없음", "[ ] INTAKE_ENABLED=false 확인"], styles, HexColor("#C78700")),
    ])
    source_appendix(story, styles, developer=True)
    story.extend([
        Spacer(1, 5 * mm),
        callout("결론", "코드 기반 P0는 상당 부분 준비됐지만 운영 P0는 원본·현장·법률·Cloudflare 실계정 증빙이 없으므로 완료가 아니다. 다음 개발은 기능 추가보다 운영 gate를 증명하고 문서 기준선을 최신화하는 데 우선순위를 둔다.", styles, "pink"),
    ])
    return story


def page_callback(title: str, audience: str):
    def draw(canvas, doc):
        canvas.saveState()
        width, height = A4
        page = canvas.getPageNumber()
        if page > 1:
            canvas.setFont("MalgunBold", 7.5)
            canvas.setFillColor(MUTED)
            canvas.drawString(doc.leftMargin, height - 12 * mm, title)
            canvas.setFont("Malgun", 7.2)
            canvas.drawRightString(width - doc.rightMargin, height - 12 * mm, audience)
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.4)
            canvas.line(doc.leftMargin, height - 14 * mm, width - doc.rightMargin, height - 14 * mm)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.4)
        canvas.line(doc.leftMargin, 13 * mm, width - doc.rightMargin, 13 * mm)
        canvas.setFont("Malgun", 7.2)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, 8.7 * mm, "하모니직업소개소 | docs 전체 요약 | Mock 기준")
        canvas.drawRightString(width - doc.rightMargin, 8.7 * mm, f"{page}")
        canvas.restoreState()
    return draw


def build_pdf(path: Path, title: str, audience: str, story: list, margins: tuple[float, float, float, float]) -> None:
    left, right, top, bottom = margins
    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        leftMargin=left,
        rightMargin=right,
        topMargin=top,
        bottomMargin=bottom,
        title=title,
        author="OpenAI Codex for 하모니직업소개소",
        subject="docs 폴더 Markdown 전체 요약",
        creator="ReportLab",
    )
    callback = page_callback(title, audience)
    doc.build(story, onFirstPage=callback, onLaterPages=callback)


def main() -> None:
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    owner_styles = make_styles("owner")
    developer_styles = make_styles("developer")
    owner_path = OUTPUT_DIR / "harmony-owner-one-person-operations-guide.pdf"
    developer_path = OUTPUT_DIR / "harmony-developer-implementation-guide.pdf"
    build_pdf(
        owner_path,
        "하모니직업소개소 사장님 업무 안내서",
        "1인 직업소개소 사장님용",
        owner_story(owner_styles),
        (18 * mm, 18 * mm, 20 * mm, 18 * mm),
    )
    build_pdf(
        developer_path,
        "하모니직업소개소 개발·운영 가이드",
        "개발자·운영 설계자용",
        developer_story(developer_styles),
        (16 * mm, 16 * mm, 20 * mm, 18 * mm),
    )
    print(owner_path)
    print(developer_path)


if __name__ == "__main__":
    main()
