/**
 * Skyward Sword HD (1.0.1) — Pure JS ARM64 Patch Engine (.pchtxt + .ips + .zip)
 * Zero external dependencies. Runs in browser or Node.js.
 *
 * Title ID : 01002DA013484000
 * Build ID : 5441AF3C89F97E1D25A8CCF14C742BF82336D8A8 (Version 1.0.1)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SSHDPatchEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TITLE_ID = "01002DA013484000";
  const BUILD_ID = "5441AF3C89F97E1D25A8CCF14C742BF82336D8A8";
  const NSO_OFFSET_SHIFT = 0x100;

  // Verified addresses in Skyward Sword HD 1.0.1 main NSO (.text)
  const ADDR_DAMAGE_NEG = 0x00A688E4; // dAcPy_c::applyDamage: neg w1, w2
  const ADDR_HEAL_MOV   = 0x00A68B9C; // dAcPy_c::addHealth:   mov w21, w1
  const ADDR_EXEC_CALL1 = 0x00F0FEC4; // fBase_c::executePack: blr x8
  const ADDR_EXEC_CALL2 = 0x00F0FF5C; // fBase_c::executePack: blr x8 (deferred)
  const ADDR_CAVE_BASE  = 0x00504D50; // dAcJtest_c::createHeap (unused test actor)

  const ADDR_TIME_PAGE  = 0x0181B000; // g_deltaFloat (+0xd38), g_tickByte (+0xd40)
  const ADDR_FRAME_PAGE = 0x2CFFD000; // 60fps frame counter 0..9 (+0x814)

  // --- ARM64 instruction encoders ---
  function u32(v) {
    return v >>> 0;
  }

  function encAdrp(pc, rd, targetPage) {
    const deltaPages = (targetPage - (pc & ~0xFFF)) >> 12;
    const imm = deltaPages & 0x1FFFFF;
    const immlo = imm & 0x3;
    const immhi = (imm >>> 2) & 0x7FFFF;
    return u32(0x90000000 | (immlo << 29) | (immhi << 5) | (rd & 0x1F));
  }

  function encBl(pc, target) {
    const imm26 = ((target - pc) >> 2) & 0x3FFFFFF;
    return u32(0x94000000 | imm26);
  }

  function encBcond(cond, delta) {
    const imm19 = ((delta >> 2) & 0x7FFFF);
    return u32(0x54000000 | (imm19 << 5) | (cond & 0xF));
  }

  function encCbnzW(reg, delta) {
    const imm19 = ((delta >> 2) & 0x7FFFF);
    return u32(0x35000000 | (imm19 << 5) | (reg & 0x1F));
  }

  function encMovzW(rd, imm16) {
    return u32(0x52800000 | ((imm16 & 0xFFFF) << 5) | (rd & 0x1F));
  }

  function encMovkW16(rd, imm16) {
    return u32(0x72A00000 | ((imm16 & 0xFFFF) << 5) | (rd & 0x1F));
  }

  function encCmpWImm(rn, imm12) {
    return u32(0x7100001F | ((imm12 & 0xFFF) << 10) | ((rn & 0x1F) << 5));
  }

  function encLsrW(rd, rn, shift) {
    return u32(0x53007C00 | ((shift & 0x1F) << 16) | ((rn & 0x1F) << 5) | (rd & 0x1F));
  }

  function floatToU32(val) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, val, true);
    return new DataView(buf).getUint32(0, true);
  }

  function u32ToBytesLE(word) {
    return [
      word & 0xFF,
      (word >>> 8) & 0xFF,
      (word >>> 16) & 0xFF,
      (word >>> 24) & 0xFF,
    ];
  }

  function bytesToHex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
      s += bytes[i].toString(16).toUpperCase().padStart(2, "0");
    }
    return s;
  }

  function hexAddr(addr) {
    return (addr >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  // --- Hook builders ---
  function buildEnemySpeedCave(basePc, speed) {
    const fbits = floatToU32(speed);
    const lo16 = fbits & 0xFFFF;
    const hi16 = (fbits >>> 16) & 0xFFFF;

    const extra = Math.max(0, Math.min(5, Math.round(5.0 * (speed - 1.0))));
    const threshold = (5 - extra) * 2;

    const items = [
      () => 0x39405809,                              // ldrb w9, [x0, #0x16]
      () => encCmpWImm(9, 2),                        // cmp w9, #2
      (pc, lbl) => encBcond(0x1, lbl.normal - pc),   // b.ne normal
      () => 0x3946A809,                              // ldrb w9, [x0, #0x1aa]
      () => encCmpWImm(9, 1),                        // cmp w9, #1
      (pc, lbl) => encBcond(0x1, lbl.normal - pc),   // b.ne normal

      () => 0xA9BD7BFD,                              // stp x29, x30, [sp, #-0x30]!
      () => 0xA90153F3,                              // stp x19, x20, [sp, #0x10]
      () => 0xF90013F5,                              // str x21, [sp, #0x20]

      (pc) => encAdrp(pc, 19, ADDR_TIME_PAGE),       // adrp x19, 0x0181b000
      () => 0xBD4D3A60,                              // ldr s0, [x19, #0xd38]
      () => 0x1E260014,                              // fmov w20, s0
      () => encMovzW(9, lo16),                       // movz w9, #lo16
      () => encMovkW16(9, hi16),                     // movk w9, #hi16, lsl #16
      () => 0x1E270121,                              // fmov s1, w9
      () => 0x1E210800,                              // fmul s0, s0, s1
      () => 0xBD0D3A60,                              // str s0, [x19, #0xd38]

      () => 0x39750275,                              // ldrb w21, [x19, #0xd40]
    ];

    if (extra > 0) {
      items.push((pc, lbl) => encCbnzW(21, lbl.call_orig - pc)); // cbnz w21, call_orig
      if (threshold > 0) {
        items.push((pc) => encAdrp(pc, 9, ADDR_FRAME_PAGE));     // adrp x9, 0x2cffd000
        items.push(() => 0x39605129);                            // ldrb w9, [x9, #0x814]
        items.push(() => encCmpWImm(9, threshold));              // cmp w9, #threshold
        items.push((pc, lbl) => encBcond(0x3, lbl.call_orig - pc)); // b.lo call_orig
      }
      items.push(() => 0x5280002A);                              // mov w10, #1
      items.push(() => 0x3935026A);                              // strb w10, [x19, #0xd40]
    }

    items.push("label:call_orig");
    items.push(() => 0xD63F0100);                    // blr x8
    items.push(() => 0xB90D3A74);                    // str w20, [x19, #0xd38]
    items.push(() => 0x39350275);                    // strb w21, [x19, #0xd40]
    items.push(() => 0xF94013F5);                    // ldr x21, [sp, #0x20]
    items.push(() => 0xA94153F3);                    // ldp x19, x20, [sp, #0x10]
    items.push(() => 0xA8C37BFD);                    // ldp x29, x30, [sp], #0x30
    items.push(() => 0xD65F03C0);                    // ret
    items.push("label:normal");
    items.push(() => 0xD61F0100);                    // br x8

    return resolveAndEmit(basePc, items);
  }

  function buildDamageCave(basePc, damageMult) {
    // Convert multiplier (step 0.25) into exact fraction num / den with den in {1, 2, 4}
    let num = Math.round(damageMult * 4);
    let den = 4;
    while (den > 1 && num % 2 === 0) {
      num /= 2;
      den /= 2;
    }
    const shift = den === 1 ? 0 : den === 2 ? 1 : 2;

    const items = [
      () => encMovzW(1, num),                        // mov w1, #num
      () => 0x1B017C41,                              // mul w1, w2, w1
    ];
    if (shift > 0) {
      items.push(() => encLsrW(1, 1, shift));        // lsr w1, w1, #shift
    }
    items.push(() => 0x4B0103E1);                    // neg w1, w1
    items.push(() => 0xD65F03C0);                    // ret

    return resolveAndEmit(basePc, items);
  }

  function buildHealCave(basePc) {
    const items = [
      () => 0x2A0103F5,                              // mov w21, w1
      () => 0x710006BF,                              // cmp w21, #1
      (pc, lbl) => encBcond(0xD, lbl.done - pc),     // b.le done
      () => 0x53017EB5,                              // lsr w21, w21, #1
      "label:done",
      () => 0xD65F03C0,                              // ret
    ];
    return resolveAndEmit(basePc, items);
  }

  function resolveAndEmit(basePc, items) {
    const labels = {};
    let pc = basePc;
    for (const it of items) {
      if (typeof it === "string" && it.startsWith("label:")) {
        labels[it.slice(6)] = pc;
      } else {
        pc += 4;
      }
    }
    const words = [];
    pc = basePc;
    for (const it of items) {
      if (typeof it === "string") continue;
      words.push(u32(it(pc, labels)));
      pc += 4;
    }
    return words;
  }

  /**
   * Generates patch records, .pchtxt string, and IPS32 Uint8Array.
   * @param {{ damage: number, speed: number, heal: number }} opts
   */
  function generatePatches(opts) {
    const damage = Number(opts.damage);
    const speed = Number(opts.speed);
    const heal = Number(opts.heal);

    if (damage < 1 || damage > 4 || Math.abs(damage * 4 - Math.round(damage * 4)) > 1e-6) {
      throw new Error("Damage multiplier must be between 1.0 and 4.0 in 0.25 steps.");
    }
    if (speed < 1 || speed > 2) {
      throw new Error("Enemy speed multiplier must be between 1.0 and 2.0.");
    }
    if (heal !== 0.5 && heal !== 1.0) {
      throw new Error("Heal multiplier must be 0.5 or 1.0.");
    }

    let pcCursor = ADDR_CAVE_BASE;
    const caveWords = [];
    const hunks = []; // Array<{ addr: number, bytes: number[] }>

    let blExec1 = null;
    let blExec2 = null;
    if (speed > 1.0) {
      const addrSpeed = pcCursor;
      const speedWords = buildEnemySpeedCave(addrSpeed, speed);
      caveWords.push(...speedWords);
      pcCursor += speedWords.length * 4;
      blExec1 = encBl(ADDR_EXEC_CALL1, addrSpeed);
      blExec2 = encBl(ADDR_EXEC_CALL2, addrSpeed);
    }

    let blDmg = null;
    if (damage > 1.0) {
      const addrDmg = pcCursor;
      const dmgWords = buildDamageCave(addrDmg, damage);
      caveWords.push(...dmgWords);
      pcCursor += dmgWords.length * 4;
      blDmg = encBl(ADDR_DAMAGE_NEG, addrDmg);
    }

    let blHeal = null;
    if (heal === 0.5) {
      const addrHeal = pcCursor;
      const healWords = buildHealCave(addrHeal);
      caveWords.push(...healWords);
      pcCursor += healWords.length * 4;
      blHeal = encBl(ADDR_HEAL_MOV, addrHeal);
    }

    if (blDmg !== null) {
      hunks.push({ addr: ADDR_DAMAGE_NEG, bytes: u32ToBytesLE(blDmg) });
    }
    if (blHeal !== null) {
      hunks.push({ addr: ADDR_HEAL_MOV, bytes: u32ToBytesLE(blHeal) });
    }
    if (blExec1 !== null) {
      hunks.push({ addr: ADDR_EXEC_CALL1, bytes: u32ToBytesLE(blExec1) });
      hunks.push({ addr: ADDR_EXEC_CALL2, bytes: u32ToBytesLE(blExec2) });
    }

    // Build .pchtxt (NO blank lines or comments inside @enabled .. @stop!)
    const healDesc = heal === 0.5 ? "Curacion -50%" : "Curacion normal";
    const pchLines = [
      `@nsobid-${BUILD_ID}`,
      "@flag print_values",
      "@flag offset_shift 0x100",
      "",
      `// Skyward Sword HD 1.0.1 - Hard Mode v2 (Dano x${damage}, Velocidad Enemigos ${speed}x, ${healDesc})`,
      "@enabled",
    ];

    for (const h of hunks) {
      pchLines.push(`${hexAddr(h.addr)} ${bytesToHex(h.bytes)}`);
    }

    const caveBytes = [];
    for (let i = 0; i < caveWords.length; i += 4) {
      const chunk = caveWords.slice(i, i + 4);
      const chunkAddr = ADDR_CAVE_BASE + i * 4;
      const chunkBytes = [];
      for (const w of chunk) {
        const b = u32ToBytesLE(w);
        chunkBytes.push(...b);
        caveBytes.push(...b);
      }
      pchLines.push(`${hexAddr(chunkAddr)} ${bytesToHex(chunkBytes)}`);
    }

    pchLines.push("@stop");
    pchLines.push("");
    const pchtxt = pchLines.join("\n");

    // Build IPS32 binary (standard Switch Atmosphere exefs_patches format)
    const ipsHunks = hunks.slice();
    if (caveBytes.length > 0) {
      ipsHunks.push({ addr: ADDR_CAVE_BASE, bytes: caveBytes });
    }
    // Sort hunks by offset ascending for clean IPS32 output
    ipsHunks.sort((a, b) => a.addr - b.addr);

    let ipsTotalLen = 5 + 4; // "IPS32" + "EEOF"
    for (const h of ipsHunks) {
      ipsTotalLen += 6 + h.bytes.length;
    }
    const ips = new Uint8Array(ipsTotalLen);
    const dv = new DataView(ips.buffer);
    let pos = 0;
    // "IPS32"
    ips.set([0x49, 0x50, 0x53, 0x33, 0x32], pos);
    pos += 5;
    for (const h of ipsHunks) {
      const fileOffset = (h.addr + NSO_OFFSET_SHIFT) >>> 0;
      dv.setUint32(pos, fileOffset, false); // big-endian u32
      pos += 4;
      dv.setUint16(pos, h.bytes.length, false); // big-endian u16
      pos += 2;
      ips.set(h.bytes, pos);
      pos += h.bytes.length;
    }
    // "EEOF"
    ips.set([0x45, 0x45, 0x4F, 0x46], pos);

    return {
      titleId: TITLE_ID,
      buildId: BUILD_ID,
      pchtxt,
      ips,
      caveSize: caveBytes.length,
    };
  }

  // --- Minimal pure-JS uncompressed (STORE) ZIP builder with CRC32 ---
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function strToUtf8(str) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(str);
    }
    return Uint8Array.from(Buffer.from(str, "utf8"));
  }

  /**
   * Creates a standard ZIP archive (Uint8Array) from [{ name: string, data: Uint8Array|string }].
   */
  function buildZip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = strToUtf8(entry.name);
      const dataBytes = typeof entry.data === "string" ? strToUtf8(entry.data) : entry.data;
      const crc = crc32(dataBytes);
      const len = dataBytes.length;

      // Local file header (30 bytes + name)
      const lh = new Uint8Array(30 + nameBytes.length);
      const ldv = new DataView(lh.buffer);
      ldv.setUint32(0, 0x04034B50, true);
      ldv.setUint16(4, 20, true);       // version needed
      ldv.setUint16(6, 0x0800, true);   // UTF-8 flag
      ldv.setUint16(8, 0, true);        // STORE (no compression)
      ldv.setUint16(10, 0, true);       // mod time
      ldv.setUint16(12, 0x5421, true);  // mod date
      ldv.setUint32(14, crc, true);
      ldv.setUint32(18, len, true);
      ldv.setUint32(22, len, true);
      ldv.setUint16(26, nameBytes.length, true);
      ldv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      localParts.push(lh, dataBytes);

      // Central directory header (46 bytes + name)
      const ch = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(ch.buffer);
      cdv.setUint32(0, 0x02014B50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0x0800, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, 0, true);
      cdv.setUint16(14, 0x5421, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, len, true);
      cdv.setUint32(24, len, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);

      centralParts.push(ch);
      offset += lh.length + dataBytes.length;
    }

    const centralOffset = offset;
    let centralSize = 0;
    for (const c of centralParts) centralSize += c.length;

    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054B50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, entries.length, true);
    edv.setUint16(10, entries.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, centralOffset, true);
    edv.setUint16(20, 0, true);

    const total = centralOffset + centralSize + 22;
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const p of localParts) { out.set(p, cursor); cursor += p.length; }
    for (const p of centralParts) { out.set(p, cursor); cursor += p.length; }
    out.set(eocd, cursor);
    return out;
  }

  return {
    TITLE_ID,
    BUILD_ID,
    generatePatches,
    buildZip,
  };
});
