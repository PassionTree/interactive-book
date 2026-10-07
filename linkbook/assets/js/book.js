/* LinkBook configuration consumed by ../../shared/js/common.js */
window.NB_BOOK = {
  name: 'LinkBook',
  tagline: '인터랙티브 칩 인터페이스 & 링크 교과서',
  logo: '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="8" fill="var(--accent)"/>' +
    '<path d="M5 16 C9 8, 12 8, 16 16 S23 24, 27 16" stroke="#fff" stroke-width="2.2" fill="none"/>' +
    '<path d="M5 16 C9 24, 12 24, 16 16 S23 8, 27 16" stroke="#fff" stroke-width="2.2" fill="none" opacity=".55"/></svg>',
  chapters: [
    { file: 'index.html', num: '', title: '표지' },
    { file: '01-link.html', num: '01', title: '링크란 무엇인가', desc: '병렬 vs 직렬, 대역폭 계산, 인터페이스의 지형도' },
    { file: '02-tline.html', num: '02', title: '전송선로와 반사', desc: '특성 임피던스, 반사 계수, 종단, 바운스 다이어그램' },
    { file: '03-si.html', num: '03', title: '채널 손실과 아이 다이어그램', desc: '주파수 의존 손실, ISI, 펄스 응답, 아이 다이어그램' },
    { file: '04-eq.html', num: '04', title: '등화: FFE · CTLE · DFE', desc: '닫힌 아이를 다시 여는 세 가지 방법' },
    { file: '05-signaling.html', num: '05', title: '시그널링과 라인 코딩', desc: '차동 신호, NRZ vs PAM4, 8b/10b, 스크램블러' },
    { file: '06-clocking.html', num: '06', title: '클로킹, 지터, CDR', desc: '스큐, 지터와 배스텁 곡선, 클록·데이터 복원' },
    { file: '07-linklayer.html', num: '07', title: '링크 계층: 오류와 재전송', desc: 'BER, CRC, 해밍 코드, ACK/NAK 재전송' },
    { file: '08-handshake.html', num: '08', title: '온칩 인터페이스와 CDC', desc: 'valid/ready 핸드셰이크, 메타안정성, 비동기 FIFO' },
    { file: '09-real.html', num: '09', title: '실제 인터페이스', desc: 'PCIe, DDR/HBM, UCIe와 칩렛, 에너지 효율' },
    { file: '10-appendix.html', num: 'A', title: '부록: 용어집 & 참고문헌', desc: '용어 정리, 수식 모음, 더 읽을거리' }
  ]
};
