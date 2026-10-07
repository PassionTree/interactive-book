/* NoC Book configuration consumed by ../../shared/js/common.js */
window.NB_BOOK = {
  name: 'NoC Book',
  tagline: '인터랙티브 Network-on-Chip 교과서',
  chapters: [
    { file: 'index.html', num: '', title: '표지', short: '표지' },
    { file: '01-intro.html', num: '01', title: '왜 Network-on-Chip인가', desc: '버스에서 네트워크로: 멀티코어 시대의 통신 문제' },
    { file: '02-topology.html', num: '02', title: '토폴로지', desc: 'Ring, Mesh, Torus, Butterfly, Fat-tree — 연결의 모양' },
    { file: '03-routing.html', num: '03', title: '라우팅', desc: 'XY, Turn model, Odd-Even, Adaptive — 길을 고르는 법' },
    { file: '04-flow-control.html', num: '04', title: '플로우 컨트롤', desc: '패킷·플릿, Wormhole, Credit — 버퍼를 나누는 법' },
    { file: '05-router.html', num: '05', title: '라우터 마이크로아키텍처', desc: '파이프라인, 크로스바, Lookahead, Bypass' },
    { file: '06-deadlock.html', num: '06', title: '가상 채널과 데드락', desc: 'HoL Blocking, 순환 의존성, Dateline' },
    { file: '07-allocation.html', num: '07', title: '중재와 할당', desc: 'Round-robin, Matrix arbiter, Separable/Wavefront allocator' },
    { file: '08-performance.html', num: '08', title: '성능 분석 & NoC 시뮬레이터', desc: 'Latency–Throughput 곡선과 사이클 단위 시뮬레이션' },
    { file: '09-advanced.html', num: '09', title: '고급 주제와 실제 칩', desc: 'Bufferless, QoS, 전력, Chiplet, 상용 NoC' },
    { file: '10-appendix.html', num: 'A', title: '부록: 용어집 & 참고문헌', desc: '용어 정리, 수식 모음, 더 읽을거리' }
  ]
};
