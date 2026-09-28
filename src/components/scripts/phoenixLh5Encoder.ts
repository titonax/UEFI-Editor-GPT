const DICTIONARY_SIZE = 1 << 13;
const MAX_MATCH = 256;
const MIN_MATCH = 3;
const MAX_BLOCK_TOKENS = 0xffff;
const MAX_CHAIN_CANDIDATES = 256;
const C_SYMBOL_COUNT = 510;
const T_SYMBOL_COUNT = 19;
const P_SYMBOL_COUNT = 14;
const C_BIT_COUNT = 9;
const T_BIT_COUNT = 5;
const P_BIT_COUNT = 4;

interface LiteralToken {
  kind: "literal";
  value: number;
}

interface MatchToken {
  kind: "match";
  length: number;
  position: number;
}

type Lh5Token = LiteralToken | MatchToken;

interface HuffmanTable {
  lengths: Uint8Array;
  codes: Uint16Array;
  root: number;
}

class MostSignificantBitWriter {
  private bytes: number[] = [];
  private currentByte = 0;
  private usedBits = 0;

  write(value: number, bitCount: number) {
    if (!Number.isInteger(value) || value < 0 || value >= 2 ** bitCount) {
      throw new RangeError(
        `Value ${String(value)} does not fit in ${String(bitCount)} bits.`,
      );
    }
    for (let bit = bitCount - 1; bit >= 0; bit -= 1) {
      this.currentByte = (this.currentByte << 1) | ((value >>> bit) & 1);
      this.usedBits += 1;
      if (this.usedBits === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.usedBits = 0;
      }
    }
  }

  finish() {
    if (this.usedBits > 0) {
      this.bytes.push(this.currentByte << (8 - this.usedBits));
    }
    // The bounded independent decoder checks for physical exhaustion before
    // decoding a constant-table symbol, even when that symbol consumes no bits.
    if (this.bytes.length > 0) this.bytes.push(0);
    return Uint8Array.from(this.bytes);
  }
}

function keyAt(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function insertPosition(
  bytes: Uint8Array,
  chains: Map<number, number[]>,
  offset: number,
) {
  if (offset + MIN_MATCH > bytes.length) return;
  const key = keyAt(bytes, offset);
  const positions = chains.get(key);
  if (positions) positions.push(offset);
  else chains.set(key, [offset]);
}

function findMatch(bytes: Uint8Array, chains: Map<number, number[]>, offset: number) {
  const remaining = bytes.length - offset;
  if (remaining < MIN_MATCH) return { length: 0, distance: 0 };
  const positions = chains.get(keyAt(bytes, offset));
  if (!positions) return { length: 0, distance: 0 };

  const maximumLength = Math.min(MAX_MATCH, remaining);
  let bestLength = 0;
  let bestDistance = 0;
  let examined = 0;
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const candidate = positions[index];
    const distance = offset - candidate;
    if (distance > DICTIONARY_SIZE) break;
    examined += 1;
    let length = MIN_MATCH;
    while (
      length < maximumLength &&
      bytes[candidate + length] === bytes[offset + length]
    ) {
      length += 1;
    }
    if (length > bestLength) {
      bestLength = length;
      bestDistance = distance;
      if (length === maximumLength) break;
    }
    if (examined >= MAX_CHAIN_CANDIDATES) break;
  }
  return bestLength >= MIN_MATCH
    ? { length: bestLength, distance: bestDistance }
    : { length: 0, distance: 0 };
}

function tokenize(bytes: Uint8Array): Lh5Token[] {
  const tokens: Lh5Token[] = [];
  const chains = new Map<number, number[]>();
  let offset = 0;
  while (offset < bytes.length) {
    const current = findMatch(bytes, chains, offset);
    insertPosition(bytes, chains, offset);
    const next =
      current.length >= MIN_MATCH
        ? findMatch(bytes, chains, offset + 1)
        : { length: 0, distance: 0 };
    if (current.length < MIN_MATCH || next.length > current.length) {
      tokens.push({ kind: "literal", value: bytes[offset] });
      offset += 1;
      continue;
    }

    tokens.push({
      kind: "match",
      length: current.length,
      position: current.distance - 1,
    });
    for (let index = 1; index < current.length; index += 1) {
      insertPosition(bytes, chains, offset + index);
    }
    offset += current.length;
  }
  return tokens;
}

function bitLength(value: number) {
  let length = 0;
  for (let remaining = value; remaining > 0; remaining >>>= 1) length += 1;
  return length;
}

function makeHuffmanTable(frequencies: Uint32Array): HuffmanTable {
  const symbolCount = frequencies.length;
  const lengths = new Uint8Array(symbolCount);
  const codes = new Uint16Array(symbolCount);
  const nodes: { frequency: number; left: number; right: number }[] = [];
  const queue: number[] = [];
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    if (frequencies[symbol] === 0) continue;
    nodes[symbol] = { frequency: frequencies[symbol], left: -1, right: -1 };
    queue.push(symbol);
  }
  if (queue.length === 0) return { lengths, codes, root: 0 };
  if (queue.length === 1) return { lengths, codes, root: queue[0] };

  const sortedLeaves: number[] = [];
  let nextNode = symbolCount;
  const takeLeast = () => {
    queue.sort((left, right) => {
      const difference = nodes[left].frequency - nodes[right].frequency;
      return difference !== 0 ? difference : left - right;
    });
    const selected = queue.shift();
    if (selected === undefined) throw new Error("LH5 Huffman queue is empty.");
    return selected;
  };
  while (queue.length > 1) {
    const left = takeLeast();
    const right = takeLeast();
    if (left < symbolCount) sortedLeaves.push(left);
    if (right < symbolCount) sortedLeaves.push(right);
    nodes[nextNode] = {
      frequency: nodes[left].frequency + nodes[right].frequency,
      left,
      right,
    };
    queue.push(nextNode);
    nextNode += 1;
  }
  const root = queue[0];
  const leafCounts = new Uint32Array(17);
  const countLeaves = (node: number, depth: number) => {
    if (node < symbolCount) leafCounts[Math.min(depth, 16)] += 1;
    else {
      countLeaves(nodes[node].left, depth + 1);
      countLeaves(nodes[node].right, depth + 1);
    }
  };
  countLeaves(root, 0);

  let overflow = 0;
  for (let length = 16; length > 0; length -= 1) {
    overflow = (overflow + (leafCounts[length] << (16 - length))) & 0xffff;
  }
  if (overflow > 0) {
    leafCounts[16] -= overflow;
    while (overflow > 0) {
      for (let length = 15; length > 0; length -= 1) {
        if (leafCounts[length] === 0) continue;
        leafCounts[length] -= 1;
        leafCounts[length + 1] += 2;
        break;
      }
      overflow -= 1;
    }
  }

  let sortedIndex = 0;
  for (let length = 16; length > 0; length -= 1) {
    for (let count = leafCounts[length]; count > 0; count -= 1) {
      lengths[sortedLeaves[sortedIndex++]] = length;
    }
  }
  const starts = new Uint32Array(17);
  let total = 0;
  for (let length = 1; length <= 16; length += 1) {
    starts[length] = total;
    total += (1 << (16 - length)) * leafCounts[length];
  }
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    const length = lengths[symbol];
    if (length === 0) continue;
    codes[symbol] = starts[length];
    starts[length] += 1 << (16 - length);
  }
  return { lengths, codes, root };
}

function writeCode(
  writer: MostSignificantBitWriter,
  table: HuffmanTable,
  symbol: number,
) {
  const length = table.lengths[symbol];
  if (length > 0) writer.write(table.codes[symbol] >>> (16 - length), length);
}

function tFrequencies(cLengths: Uint8Array) {
  const frequencies = new Uint32Array(T_SYMBOL_COUNT);
  let end = cLengths.length;
  while (end > 0 && cLengths[end - 1] === 0) end -= 1;
  let offset = 0;
  while (offset < end) {
    const length = cLengths[offset++];
    if (length !== 0) {
      frequencies[length + 2] += 1;
      continue;
    }
    let count = 1;
    while (offset < end && cLengths[offset] === 0) {
      offset += 1;
      count += 1;
    }
    if (count <= 2) frequencies[0] += count;
    else if (count <= 18) frequencies[1] += 1;
    else if (count === 19) {
      frequencies[0] += 1;
      frequencies[1] += 1;
    } else frequencies[2] += 1;
  }
  return frequencies;
}

function writePtLengths(
  writer: MostSignificantBitWriter,
  lengths: Uint8Array,
  bitCount: number,
  specialIndex: number,
) {
  let end = lengths.length;
  while (end > 0 && lengths[end - 1] === 0) end -= 1;
  writer.write(end, bitCount);
  let offset = 0;
  while (offset < end) {
    const length = lengths[offset++];
    if (length <= 6) writer.write(length, 3);
    else {
      const encodedBits = length - 3;
      writer.write(2 ** encodedBits - 2, encodedBits);
    }
    if (offset === specialIndex) {
      while (offset < 6 && lengths[offset] === 0) offset += 1;
      writer.write(offset - 3, 2);
    }
  }
}

function writeCLengths(
  writer: MostSignificantBitWriter,
  cLengths: Uint8Array,
  tTable: HuffmanTable,
) {
  let end = cLengths.length;
  while (end > 0 && cLengths[end - 1] === 0) end -= 1;
  writer.write(end, C_BIT_COUNT);
  let offset = 0;
  while (offset < end) {
    const length = cLengths[offset++];
    if (length !== 0) {
      writeCode(writer, tTable, length + 2);
      continue;
    }
    let count = 1;
    while (offset < end && cLengths[offset] === 0) {
      offset += 1;
      count += 1;
    }
    if (count <= 2) {
      for (let index = 0; index < count; index += 1) writeCode(writer, tTable, 0);
    } else if (count <= 18) {
      writeCode(writer, tTable, 1);
      writer.write(count - 3, 4);
    } else if (count === 19) {
      writeCode(writer, tTable, 0);
      writeCode(writer, tTable, 1);
      writer.write(15, 4);
    } else {
      writeCode(writer, tTable, 2);
      writer.write(count - 20, C_BIT_COUNT);
    }
  }
}

function encodeBlock(writer: MostSignificantBitWriter, tokens: Lh5Token[]) {
  const cFrequencies = new Uint32Array(C_SYMBOL_COUNT);
  const pFrequencies = new Uint32Array(P_SYMBOL_COUNT);
  for (const token of tokens) {
    if (token.kind === "literal") cFrequencies[token.value] += 1;
    else {
      cFrequencies[token.length + 253] += 1;
      pFrequencies[bitLength(token.position)] += 1;
    }
  }
  const cTable = makeHuffmanTable(cFrequencies);
  const tTable = makeHuffmanTable(tFrequencies(cTable.lengths));
  const pTable = makeHuffmanTable(pFrequencies);

  writer.write(tokens.length, 16);
  if (cTable.root >= C_SYMBOL_COUNT) {
    if (tTable.root >= T_SYMBOL_COUNT)
      writePtLengths(writer, tTable.lengths, T_BIT_COUNT, 3);
    else {
      writer.write(0, T_BIT_COUNT);
      writer.write(tTable.root, T_BIT_COUNT);
    }
    writeCLengths(writer, cTable.lengths, tTable);
  } else {
    writer.write(0, T_BIT_COUNT);
    writer.write(0, T_BIT_COUNT);
    writer.write(0, C_BIT_COUNT);
    writer.write(cTable.root, C_BIT_COUNT);
  }
  if (pTable.root >= P_SYMBOL_COUNT)
    writePtLengths(writer, pTable.lengths, P_BIT_COUNT, -1);
  else {
    writer.write(0, P_BIT_COUNT);
    writer.write(pTable.root, P_BIT_COUNT);
  }

  for (const token of tokens) {
    if (token.kind === "literal") writeCode(writer, cTable, token.value);
    else {
      writeCode(writer, cTable, token.length + 253);
      const pSymbol = bitLength(token.position);
      writeCode(writer, pTable, pSymbol);
      if (pSymbol > 1)
        writer.write(token.position & (2 ** (pSymbol - 1) - 1), pSymbol - 1);
    }
  }
}

/** Deterministic raw -lh5- encoder (8 KiB LZSS + per-block static Huffman). */
export function encodePhoenixLh5(uncompressed: Uint8Array): Uint8Array {
  if (uncompressed.length === 0) return new Uint8Array();
  const tokens = tokenize(uncompressed);
  const writer = new MostSignificantBitWriter();
  for (let offset = 0; offset < tokens.length; offset += MAX_BLOCK_TOKENS) {
    encodeBlock(writer, tokens.slice(offset, offset + MAX_BLOCK_TOKENS));
  }
  return writer.finish();
}
