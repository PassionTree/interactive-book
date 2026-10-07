# NoC Book — 인터랙티브 Network-on-Chip 교과서

칩 안의 네트워크(Network-on-Chip)를 **브라우저에서 직접 만지며** 배우는 웹 교과서입니다.
토폴로지 · 라우팅 · 플로우 컨트롤 · 라우터 마이크로아키텍처 · 가상 채널과 데드락 · 중재/할당 · 성능 분석까지,
29개의 인터랙티브 실험과 사이클 단위 NoC 시뮬레이터를 담았습니다.

🌐 **사이트:** https://passiontree.github.io/nocbook/

📡 **자매편 LinkBook (칩 인터페이스 & 링크):** https://passiontree.github.io/nocbook/linkbook/
— 전송선로·반사, 채널 손실과 아이 다이어그램, FFE/CTLE/DFE 등화, PAM4·8b/10b·스크램블러, 지터·CDR,
CRC·해밍·Go-Back-N 재전송, valid/ready·메타안정성·비동기 FIFO, PCIe·HBM·UCIe (29개 실험).
소스는 `linkbook/` (장별 본문 원본은 `linkbook/src/`, `python3 linkbook/src/build.py <src> <out> <title> <desc> <js>`로 페이지 생성).

## 구성

| 장 | 내용 | 주요 실험 |
|---|---|---|
| 01 | 왜 NoC인가 | Bus/Crossbar/Mesh 비교, 버스 경합, 와이어 지연, 패킷의 여정 |
| 02 | 토폴로지 | 토폴로지 탐험기(홉 거리·이분 절단), 폴디드 토러스, 확장성 차트 |
| 03 | 라우팅 | 경로 탐험기, Turn model 검사기(CDG 사이클 탐지), XY vs 적응형 라이브 비교 |
| 04 | 플로우 컨트롤 | 패킷 해부, SAF/VCT/Wormhole 시공간 다이어그램, Credit 애니메이션 |
| 05 | 라우터 구조 | VC 라우터 해부도, 파이프라인 시공간표, 크로스바, 면적 모델 |
| 06 | VC와 데드락 | HoL 블로킹, 2×2 데드락 재현, CDG/Dateline, 데드락 실험실 |
| 07 | 중재와 할당 | 중재기 공정성 비교, 분리형/웨이브프론트 할당기 |
| 08 | 성능 & 시뮬레이터 | 무부하 지연, 채널 부하 히트맵, 라이브 시뮬레이터, 지연–처리량 곡선 측정 |
| 09 | 고급 주제 | Bufferless 디플렉션 라우팅, 에너지 모델, 3D 메시, 실제 칩 사례 |
| A | 부록 | 검색 가능한 용어집, 수식 모음, 참고문헌 |

## 구조

순수 정적 사이트(HTML + CSS + Vanilla JS + Canvas/SVG)라 빌드 단계가 없습니다.

```
index.html, 01-intro.html … 10-appendix.html
assets/css/style.css     공통 디자인 (라이트/다크 테마)
assets/js/common.js      레이아웃, 목차, UI 컨트롤, 차트 헬퍼
assets/js/noc.js         사이클 단위 NoC 시뮬레이터 엔진 (VC 라우터, credit, wormhole, 라우팅/트래픽, 채널 부하 해석)
assets/js/chXX.js        장별 인터랙티브 실험
assets/vendor/katex      수식 렌더링 (KaTeX)
```

로컬에서 보기:

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/pages.yml`)가 사이트를 `gh-pages` 브랜치로 배포합니다.
저장소 **Settings → Pages**에서 Source가 `gh-pages` 브랜치 / `(root)`로 설정되어 있어야 합니다.
