/**
 * Zero-dependency QR Code SVG Generator
 * Supports Model 2 Version 4 (EC Level M) for local Wi-Fi URLs
 */

function generateQRCodeSVG(text, size = 180) {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    exp[i] = x;
    exp[i + 255] = x;
    log[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }

  function mul(a, b) {
    return a === 0 || b === 0 ? 0 : exp[log[a] + log[b]];
  }

  function polyMul(p1, p2) {
    const res = new Uint8Array(p1.length + p2.length - 1);
    for (let i = 0; i < p1.length; i++) {
      if (!p1[i]) continue;
      for (let j = 0; j < p2.length; j++) {
        if (!p2[j]) continue;
        res[i + j] ^= mul(p1[i], p2[j]);
      }
    }
    return res;
  }

  function rsGenPoly(n) {
    let p = new Uint8Array([1]);
    for (let i = 0; i < n; i++) p = polyMul(p, new Uint8Array([1, exp[i]]));
    return p;
  }

  function rsCalc(data, numEC) {
    const gen = rsGenPoly(numEC);
    const dividend = new Uint8Array(data.length + numEC);
    dividend.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const coef = dividend[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) dividend[i + j] ^= mul(gen[j], coef);
      }
    }
    return dividend.slice(data.length);
  }

  const ver = 4;
  const modCount = 17 + 4 * ver; // 33x33
  const dataPerBlock = 32;
  const ecPerBlock = 18;
  const totalData = 64;

  const rawBytes = Buffer.from(text, 'utf8');
  const bitStream = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) bitStream.push((val >> i) & 1);
  }

  pushBits(0b0100, 4); // Byte mode
  pushBits(rawBytes.length, 8); // Character count
  for (let b of rawBytes) pushBits(b, 8);

  // Terminator
  for (let i = 0; i < 4 && bitStream.length < totalData * 8; i++) bitStream.push(0);
  while (bitStream.length % 8 !== 0) bitStream.push(0);

  const dataBytes = [];
  for (let i = 0; i < bitStream.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bitStream[i + j];
    dataBytes.push(b);
  }

  const pad = [0xec, 0x11];
  let pIdx = 0;
  while (dataBytes.length < totalData) {
    dataBytes.push(pad[pIdx % 2]);
    pIdx++;
  }

  const b1Data = dataBytes.slice(0, dataPerBlock);
  const b2Data = dataBytes.slice(dataPerBlock, 2 * dataPerBlock);
  const b1EC = rsCalc(b1Data, ecPerBlock);
  const b2EC = rsCalc(b2Data, ecPerBlock);

  const finalCodewords = [];
  for (let i = 0; i < dataPerBlock; i++) {
    finalCodewords.push(b1Data[i]);
    finalCodewords.push(b2Data[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    finalCodewords.push(b1EC[i]);
    finalCodewords.push(b2EC[i]);
  }

  const matrix = Array.from({ length: modCount }, () => Array(modCount).fill(null));
  const isReserved = Array.from({ length: modCount }, () => Array(modCount).fill(false));

  function setModule(r, c, val, reserved = true) {
    matrix[r][c] = val;
    if (reserved) isReserved[r][c] = true;
  }

  function addFinder(top, left) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = top + r;
        const nc = left + c;
        if (nr >= 0 && nr < modCount && nc >= 0 && nc < modCount) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isDark = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setModule(nr, nc, isDark);
          } else {
            setModule(nr, nc, false);
          }
        }
      }
    }
  }
  addFinder(0, 0);
  addFinder(0, modCount - 7);
  addFinder(modCount - 7, 0);

  function addAlignment(centerR, centerC) {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isDark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        setModule(centerR + r, centerC + c, isDark);
      }
    }
  }
  addAlignment(26, 26);

  for (let i = 8; i < modCount - 8; i++) {
    if (!isReserved[6][i]) setModule(6, i, i % 2 === 0);
    if (!isReserved[i][6]) setModule(i, 6, i % 2 === 0);
  }
  setModule(4 * ver + 9, 8, true);

  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isReserved[8][i] = true;
      isReserved[i][8] = true;
    }
  }
  for (let i = modCount - 8; i < modCount; i++) isReserved[8][i] = true;
  for (let i = modCount - 8; i < modCount; i++) isReserved[i][8] = true;

  const bits = [];
  for (let b of finalCodewords) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = modCount - 1; right > 0; right -= 2) {
    if (right === 6) right--;
    const rows = upwards
      ? Array.from({ length: modCount }, (_, i) => modCount - 1 - i)
      : Array.from({ length: modCount }, (_, i) => i);

    for (let r of rows) {
      for (let c of [right, right - 1]) {
        if (!isReserved[r][c]) {
          const bit = bitIdx < bits.length ? bits[bitIdx++] : 0;
          matrix[r][c] = bit === 1;
        }
      }
    }
    upwards = !upwards;
  }

  // Mask pattern 0: (row + col) % 2 === 0
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (!isReserved[r][c] && (r + c) % 2 === 0) {
        matrix[r][c] = !matrix[r][c];
      }
    }
  }

  const formatBits = [1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 1];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[8][modCount - 1 - i] = formatBits[14 - i] === 1;
  for (let i = 0; i < 7; i++) matrix[modCount - 7 + i][8] = formatBits[i] === 1;

  const quietZone = 2;
  const totalDim = modCount + quietZone * 2;
  const paths = [];
  for (let r = 0; r < modCount; r++) {
    for (let c = 0; c < modCount; c++) {
      if (matrix[r][c]) {
        paths.push(`M${c + quietZone},${r + quietZone}h1v1h-1z`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${totalDim}" height="${totalDim}" fill="#ffffff" rx="3"/>
    <path d="${paths.join('')}" fill="#0d0c12"/>
  </svg>`;
}

module.exports = { generateQRCodeSVG };
