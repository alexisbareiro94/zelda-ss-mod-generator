#!/usr/bin/env python3
"""
Skyward Sword HD (Switch v1.0.1) — Standalone Hard Mode Mod Generator (.pchtxt + .ips + .zip)
Zero external dependencies (Python 3 standard library only).

Title ID : 01002DA013484000
Build ID : 5441AF3C89F97E1D25A8CCF14C742BF82336D8A8 (Version 1.0.1)
"""
import argparse
import struct
import zipfile
from pathlib import Path

TITLE_ID = "01002DA013484000"
BUILD_ID = "5441AF3C89F97E1D25A8CCF14C742BF82336D8A8"
NSO_OFFSET_SHIFT = 0x100

# Verified addresses in Skyward Sword HD 1.0.1 main NSO (.text)
ADDR_DAMAGE_NEG = 0x00A688E4
ADDR_HEAL_MOV   = 0x00A68B9C
ADDR_EXEC_CALL1 = 0x00F0FEC4
ADDR_EXEC_CALL2 = 0x00F0FF5C
ADDR_CAVE_BASE  = 0x00504D50

ADDR_TIME_PAGE  = 0x0181B000
ADDR_FRAME_PAGE = 0x2CFFD000


def enc_adrp(pc: int, rd: int, target_page: int) -> int:
    delta_pages = (target_page - (pc & ~0xFFF)) >> 12
    imm = delta_pages & 0x1FFFFF
    immlo = imm & 0x3
    immhi = (imm >> 2) & 0x7FFFF
    return (0x90000000 | (immlo << 29) | (immhi << 5) | (rd & 0x1F)) & 0xFFFFFFFF


def enc_bl(pc: int, target: int) -> int:
    imm26 = ((target - pc) >> 2) & 0x3FFFFFF
    return (0x94000000 | imm26) & 0xFFFFFFFF


def enc_bcond(cond: int, delta: int) -> int:
    imm19 = (delta >> 2) & 0x7FFFF
    return (0x54000000 | (imm19 << 5) | (cond & 0xF)) & 0xFFFFFFFF


def enc_cbnz_w(reg: int, delta: int) -> int:
    imm19 = (delta >> 2) & 0x7FFFF
    return (0x35000000 | (imm19 << 5) | (reg & 0x1F)) & 0xFFFFFFFF


def enc_movz_w(rd: int, imm16: int) -> int:
    return (0x52800000 | ((imm16 & 0xFFFF) << 5) | (rd & 0x1F)) & 0xFFFFFFFF


def enc_movk_w16(rd: int, imm16: int) -> int:
    return (0x72A00000 | ((imm16 & 0xFFFF) << 5) | (rd & 0x1F)) & 0xFFFFFFFF


def enc_cmp_w_imm(rn: int, imm12: int) -> int:
    return (0x7100001F | ((imm12 & 0xFFF) << 10) | ((rn & 0x1F) << 5)) & 0xFFFFFFFF


def enc_lsr_w(rd: int, rn: int, shift: int) -> int:
    return (0x53007C00 | ((shift & 0x1F) << 16) | ((rn & 0x1F) << 5) | (rd & 0x1F)) & 0xFFFFFFFF


def resolve_and_emit(base_pc: int, items: list) -> list[int]:
    labels: dict[str, int] = {}
    pc = base_pc
    for it in items:
        if isinstance(it, str) and it.startswith("label:"):
            labels[it[6:]] = pc
        else:
            pc += 4
    words: list[int] = []
    pc = base_pc
    for it in items:
        if isinstance(it, str):
            continue
        words.append(it(pc, labels) & 0xFFFFFFFF)
        pc += 4
    return words


def build_enemy_speed_cave(base_pc: int, speed: float) -> list[int]:
    fbits = struct.unpack("<I", struct.pack("<f", speed))[0]
    lo16 = fbits & 0xFFFF
    hi16 = (fbits >> 16) & 0xFFFF

    # Match JS Math.round (half-up) for exact parity
    extra = max(0, min(5, int(5.0 * (speed - 1.0) + 0.5)))
    threshold = (5 - extra) * 2

    items: list = [
        lambda pc, l: 0x39405809,                             # ldrb w9, [x0, #0x16]
        lambda pc, l: enc_cmp_w_imm(9, 2),                    # cmp w9, #2
        lambda pc, l: enc_bcond(0x1, l["normal"] - pc),       # b.ne normal
        lambda pc, l: 0x3946A809,                             # ldrb w9, [x0, #0x1aa]
        lambda pc, l: enc_cmp_w_imm(9, 1),                    # cmp w9, #1
        lambda pc, l: enc_bcond(0x1, l["normal"] - pc),       # b.ne normal

        lambda pc, l: 0xA9BD7BFD,                             # stp x29, x30, [sp, #-0x30]!
        lambda pc, l: 0xA90153F3,                             # stp x19, x20, [sp, #0x10]
        lambda pc, l: 0xF90013F5,                             # str x21, [sp, #0x20]

        lambda pc, l: enc_adrp(pc, 19, ADDR_TIME_PAGE),       # adrp x19, 0x0181b000
        lambda pc, l: 0xBD4D3A60,                             # ldr s0, [x19, #0xd38]
        lambda pc, l: 0x1E260014,                             # fmov w20, s0
        lambda pc, l: enc_movz_w(9, lo16),                    # movz w9, #lo16
        lambda pc, l: enc_movk_w16(9, hi16),                  # movk w9, #hi16, lsl #16
        lambda pc, l: 0x1E270121,                             # fmov s1, w9
        lambda pc, l: 0x1E210800,                             # fmul s0, s0, s1
        lambda pc, l: 0xBD0D3A60,                             # str s0, [x19, #0xd38]

        lambda pc, l: 0x39750275,                             # ldrb w21, [x19, #0xd40]
    ]

    if extra > 0:
        items.append(lambda pc, l: enc_cbnz_w(21, l["call_orig"] - pc))
        if threshold > 0:
            items.append(lambda pc, l: enc_adrp(pc, 9, ADDR_FRAME_PAGE))
            items.append(lambda pc, l: 0x39605129)
            items.append(lambda pc, l, th=threshold: enc_cmp_w_imm(9, th))
            items.append(lambda pc, l: enc_bcond(0x3, l["call_orig"] - pc))
        items.append(lambda pc, l: 0x5280002A)                # mov w10, #1
        items.append(lambda pc, l: 0x3935026A)                # strb w10, [x19, #0xd40]

    items.extend([
        "label:call_orig",
        lambda pc, l: 0xD63F0100,                             # blr x8
        lambda pc, l: 0xB90D3A74,                             # str w20, [x19, #0xd38]
        lambda pc, l: 0x39350275,                             # strb w21, [x19, #0xd40]
        lambda pc, l: 0xF94013F5,                             # ldr x21, [sp, #0x20]
        lambda pc, l: 0xA94153F3,                             # ldp x19, x20, [sp, #0x10]
        lambda pc, l: 0xA8C37BFD,                             # ldp x29, x30, [sp], #0x30
        lambda pc, l: 0xD65F03C0,                             # ret
        "label:normal",
        lambda pc, l: 0xD61F0100,                             # br x8
    ])
    return resolve_and_emit(base_pc, items)


def build_damage_cave(base_pc: int, damage_mult: float) -> list[int]:
    num = round(damage_mult * 4)
    den = 4
    while den > 1 and num % 2 == 0:
        num //= 2
        den //= 2
    shift = 0 if den == 1 else (1 if den == 2 else 2)

    items: list = [
        lambda pc, l: enc_movz_w(1, num),
        lambda pc, l: 0x1B017C41,                             # mul w1, w2, w1
    ]
    if shift > 0:
        items.append(lambda pc, l: enc_lsr_w(1, 1, shift))
    items.extend([
        lambda pc, l: 0x4B0103E1,                             # neg w1, w1
        lambda pc, l: 0xD65F03C0,                             # ret
    ])
    return resolve_and_emit(base_pc, items)


def build_heal_cave(base_pc: int) -> list[int]:
    items: list = [
        lambda pc, l: 0x2A0103F5,                             # mov w21, w1
        lambda pc, l: 0x710006BF,                             # cmp w21, #1
        lambda pc, l: enc_bcond(0xD, l["done"] - pc),         # b.le done
        lambda pc, l: 0x53017EB5,                             # lsr w21, w21, #1
        "label:done",
        lambda pc, l: 0xD65F03C0,                             # ret
    ]
    return resolve_and_emit(base_pc, items)


def fmt_num(v: float) -> str:
    return str(int(v)) if v == int(v) else f"{v:g}"


def generate_patches(damage: float, speed: float, heal: float) -> tuple[str, bytes]:
    if not (1.0 <= damage <= 4.0 and abs(damage * 4 - round(damage * 4)) < 1e-6):
        raise ValueError("damage debe estar entre 1.0 y 4.0 en pasos de 0.25")
    if not (1.0 <= speed <= 2.0):
        raise ValueError("speed debe estar entre 1.0 y 2.0")
    if heal not in (0.5, 1.0):
        raise ValueError("heal debe ser 0.5 o 1.0")

    pc_cursor = ADDR_CAVE_BASE
    cave_words: list[int] = []
    hunks: list[tuple[int, bytes]] = []

    bl_exec1 = bl_exec2 = None
    if speed > 1.0:
        addr_speed = pc_cursor
        speed_words = build_enemy_speed_cave(addr_speed, speed)
        cave_words.extend(speed_words)
        pc_cursor += len(speed_words) * 4
        bl_exec1 = enc_bl(ADDR_EXEC_CALL1, addr_speed)
        bl_exec2 = enc_bl(ADDR_EXEC_CALL2, addr_speed)

    bl_dmg = None
    if damage > 1.0:
        addr_dmg = pc_cursor
        dmg_words = build_damage_cave(addr_dmg, damage)
        cave_words.extend(dmg_words)
        pc_cursor += len(dmg_words) * 4
        bl_dmg = enc_bl(ADDR_DAMAGE_NEG, addr_dmg)

    bl_heal = None
    if heal == 0.5:
        addr_heal = pc_cursor
        heal_words = build_heal_cave(addr_heal)
        cave_words.extend(heal_words)
        pc_cursor += len(heal_words) * 4
        bl_heal = enc_bl(ADDR_HEAL_MOV, addr_heal)

    if bl_dmg is not None:
        hunks.append((ADDR_DAMAGE_NEG, struct.pack("<I", bl_dmg)))
    if bl_heal is not None:
        hunks.append((ADDR_HEAL_MOV, struct.pack("<I", bl_heal)))
    if bl_exec1 is not None and bl_exec2 is not None:
        hunks.append((ADDR_EXEC_CALL1, struct.pack("<I", bl_exec1)))
        hunks.append((ADDR_EXEC_CALL2, struct.pack("<I", bl_exec2)))

    heal_desc = "Curacion -50%" if heal == 0.5 else "Curacion normal"
    pch_lines = [
        f"@nsobid-{BUILD_ID}",
        "@flag print_values",
        "@flag offset_shift 0x100",
        "",
        f"// Skyward Sword HD 1.0.1 - Hard Mode v2 (Dano x{fmt_num(damage)}, Velocidad Enemigos {fmt_num(speed)}x, {heal_desc})",
        "@enabled",
    ]
    for addr, raw in hunks:
        pch_lines.append(f"{addr:08X} {raw.hex().upper()}")

    cave_bytes = bytearray()
    for i in range(0, len(cave_words), 4):
        chunk = cave_words[i : i + 4]
        chunk_addr = ADDR_CAVE_BASE + i * 4
        chunk_raw = b"".join(struct.pack("<I", w) for w in chunk)
        cave_bytes.extend(chunk_raw)
        pch_lines.append(f"{chunk_addr:08X} {chunk_raw.hex().upper()}")

    pch_lines.append("@stop")
    pch_lines.append("")
    pchtxt = "\n".join(pch_lines)

    # IPS32 binary
    ips_hunks = list(hunks)
    if cave_bytes:
        ips_hunks.append((ADDR_CAVE_BASE, bytes(cave_bytes)))
    ips_hunks.sort(key=lambda x: x[0])

    ips = bytearray(b"IPS32")
    for addr, raw in ips_hunks:
        file_off = addr + NSO_OFFSET_SHIFT
        ips.extend(struct.pack(">IH", file_off, len(raw)))
        ips.extend(raw)
    ips.extend(b"EEOF")

    return pchtxt, bytes(ips)


def build_install_txt(damage: float, speed: float, heal: float) -> str:
    return "\n".join([
        "The Legend of Zelda: Skyward Sword HD (Switch v1.0.1) — Hard Mode Mod",
        f"Settings: Damage x{fmt_num(damage)} | Enemy Speed {fmt_num(speed)}x | Healing {int(heal * 100)}%",
        f"Title ID: {TITLE_ID}",
        f"Build ID: {BUILD_ID}",
        "",
        "=== EMULATORS (Eden / Yuzu / Ryujinx) ===",
        "Copy the 'SSHD_HardMode_1.0.1' folder inside 'Emulator_pchtxt/' into your emulator's mod directory for 01002DA013484000.",
        "(Right-click the game -> Open Mod Data Location / Open Mods Directory).",
        "",
        "=== NINTENDO SWITCH (Atmosphere) ===",
        "Copy the 'atmosphere' folder inside 'Switch_Atmosphere_ips/' to the root of your SD card.",
        f"Final path: sd:/atmosphere/exefs_patches/SSHD_HardMode/{BUILD_ID}.ips",
        "",
        "NOTE: Requires game update 1.0.1. Do NOT mix .pchtxt and .ips in the same folder.",
        "",
    ])


def write_release_zip(zip_path: Path, damage: float, speed: float, heal: float) -> None:
    pchtxt, ips = generate_patches(damage, speed, heal)
    install_txt = build_install_txt(damage, speed, heal)
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("Emulator_pchtxt/SSHD_HardMode_1.0.1/exefs/1.0.1.pchtxt", pchtxt)
        zf.writestr(f"Switch_Atmosphere_ips/atmosphere/exefs_patches/SSHD_HardMode/{BUILD_ID}.ips", ips)
        zf.writestr("INSTALL.txt", install_txt)


def main() -> None:
    parser = argparse.ArgumentParser(description="Skyward Sword HD 1.0.1 Hard Mode Generator (.pchtxt + .ips)")
    parser.add_argument("--damage", type=float, default=2.5, help="Multiplicador de daño (1.0..4.0, paso 0.25)")
    parser.add_argument("--speed", type=float, default=1.5, help="Velocidad de enemigos (1.0..2.0)")
    parser.add_argument("--heal", type=float, default=0.5, choices=[0.5, 1.0], help="Multiplicador de curación (0.5 o 1.0)")
    parser.add_argument("--out", type=Path, default=Path("./output"), help="Carpeta de salida")
    parser.add_argument("--zip", type=Path, default=None, help="Si se indica, genera un .zip listo para distribuir")
    args = parser.parse_args()

    if args.zip is not None:
        write_release_zip(args.zip, args.damage, args.speed, args.heal)
        print(f"[OK] ZIP generado: {args.zip}")
        return

    pchtxt, ips = generate_patches(args.damage, args.speed, args.heal)
    pch_path = args.out / "Emulator_pchtxt" / "SSHD_HardMode_1.0.1" / "exefs" / "1.0.1.pchtxt"
    ips_path = args.out / "Switch_Atmosphere_ips" / "atmosphere" / "exefs_patches" / "SSHD_HardMode" / f"{BUILD_ID}.ips"
    pch_path.parent.mkdir(parents=True, exist_ok=True)
    ips_path.parent.mkdir(parents=True, exist_ok=True)
    pch_path.write_text(pchtxt, encoding="utf-8")
    ips_path.write_bytes(ips)
    (args.out / "INSTALL.txt").write_text(build_install_txt(args.damage, args.speed, args.heal), encoding="utf-8")
    print(f"[OK] .pchtxt -> {pch_path}")
    print(f"[OK] .ips    -> {ips_path}")


if __name__ == "__main__":
    main()
