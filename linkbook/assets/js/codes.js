/* LinkBook — line codes: 8b/10b encoder, LFSR scrambler */
(function () {
  'use strict';
  const C = (window.NB.codes = {});
  // 5b/6b codes for RD- (bit order abcdei); RD+ is the complement for unbalanced codes (D.07 is special)
  const T6 = ['100111', '011101', '101101', '110001', '110101', '101001', '011001', '111000', '111001', '100101', '010101', '110100', '001101', '101100', '011100', '010111',
    '011011', '100011', '010011', '110010', '001011', '101010', '011010', '111010', '110011', '100110', '010110', '110110', '001110', '101110', '011110', '101011'];
  // 3b/4b codes (fghj) [RD-, RD+]; index 7 = primary, 8 = alternate (A7)
  const T4 = [['1011', '0100'], ['1001', '1001'], ['0101', '0101'], ['1100', '0011'], ['1101', '0010'], ['1010', '1010'], ['0110', '0110'], ['1110', '0001'], ['0111', '1000']];
  const ones = (s) => s.split('').filter((c) => c === '1').length;
  const comp = (s) => s.split('').map((c) => (c === '1' ? '0' : '1')).join('');
  function code6(x, rd) {
    const m = T6[x];
    if (rd < 0) return m;
    if (x === 7) return '000111';
    return ones(m) === 3 ? m : comp(m);
  }
  function upd(rd, s) { const o = ones(s), z = s.length - o; return o > z ? 1 : o < z ? -1 : rd; }
  // encode a byte; returns {code: 'abcdei fghj', rdOut, name}
  C.enc8b10b = function (byte, rd, isK285) {
    if (isK285) {
      const c = rd < 0 ? '001111' + '1010' : '110000' + '0101';
      return { code: c, rdOut: -rd, name: 'K28.5' };
    }
    const x = byte & 31, y = (byte >> 5) & 7;
    const c6 = code6(x, rd);
    const rd1 = upd(rd, c6);
    let idx = y;
    if (y === 7 && ((rd1 < 0 && (x === 17 || x === 18 || x === 20)) || (rd1 > 0 && (x === 11 || x === 13 || x === 14)))) idx = 8;
    const c4 = T4[idx][rd1 < 0 ? 0 : 1];
    return { code: c6 + c4, rdOut: upd(rd1, c4), name: 'D' + x + '.' + y + (idx === 8 ? ' (A7)' : '') };
  };
  // additive scrambler with PRBS LFSR (x^7+x^6+1 by default)
  C.scramble = function (bits, order, seed) {
    order = order || 7;
    const taps = { 7: [7, 6], 15: [15, 14], 23: [23, 18], 31: [31, 28] }[order];
    let s = seed || 0x7f;
    return bits.map((b) => {
      const fb = ((s >> (taps[0] - 1)) ^ (s >> (taps[1] - 1))) & 1;
      s = ((s << 1) | fb) & ((1 << order) - 1);
      return b ^ fb;
    });
  };
  C.maxRun = function (bits) { let m = 0, r = 0, p = -1; bits.forEach((b) => { r = b === p ? r + 1 : 1; p = b; m = Math.max(m, r); }); return m; };
})();
