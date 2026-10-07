# 칩 인터커넥트 교과서 — NoC Book · LinkBook

칩 **안**의 네트워크와 칩 **사이**의 링크를 브라우저에서 직접 만지며 배우는 두 권의 인터랙티브 웹 교과서입니다.

🌐 **홈:** https://passiontree.github.io/nocbook/

| 책 | 주소 | 내용 |
|---|---|---|
| **NoC Book** | https://passiontree.github.io/nocbook/nocbook/ | Network-on-Chip: 토폴로지, 라우팅, 플로우 컨트롤, 라우터 구조, 데드락, 중재/할당, 사이클 단위 NoC 시뮬레이터 (실험 29개) |
| **LinkBook** | https://passiontree.github.io/nocbook/linkbook/ | 칩 인터페이스 & 링크: 전송선로, 아이 다이어그램, FFE/CTLE/DFE, PAM4·8b/10b, 지터·CDR, CRC·재전송, CDC, PCIe·HBM·UCIe (실험 29개) |

## 폴더 구조

```
index.html            두 책을 연결하는 홈(허브) 페이지
404.html              예전 NoC Book 주소(/0X-*.html)를 nocbook/ 아래로 자동 이동
shared/               두 책이 함께 쓰는 디자인 시스템
  css/style.css         공통 스타일 (라이트/다크 테마)
  js/common.js          레이아웃, 목차, UI 컨트롤, 차트 헬퍼 (책 설정은 각 책의 book.js)
  vendor/katex/         수식 렌더링
nocbook/              NoC Book
  index.html, 01-intro.html … 10-appendix.html
  assets/js/book.js     책 이름·장 목록
  assets/js/noc.js      사이클 단위 NoC 시뮬레이터 엔진
  assets/js/chXX.js     장별 실험
linkbook/             LinkBook
  index.html, 01-link.html … 10-appendix.html
  assets/js/book.js     책 이름·장 목록
  assets/js/link.js     신호/채널/아이 다이어그램 엔진, codes.js: 8b/10b·스크램블러
  assets/js/chXX.js     장별 실험
  src/                  장 본문 원본 + build.py (공통 head/script를 씌워 페이지 생성)
```

순수 정적 사이트(HTML + CSS + Vanilla JS + Canvas/SVG)라 별도 빌드 없이 동작합니다.

로컬에서 보기:

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/pages.yml`)가 사이트를 `gh-pages` 브랜치로 배포합니다.
