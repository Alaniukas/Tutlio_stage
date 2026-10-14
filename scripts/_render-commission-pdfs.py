"""Clone Book1.xlsm layout (Tutlio indigo/violet) per invoice and export PDF."""
from __future__ import annotations

import copy
import re
import shutil
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
ET.register_namespace("", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

ROOT = Path(r"C:\Users\37062\Desktop\simo-local")
SRC_XLSX = ROOT / "output/tutlio-komisijos-sf/Tutlio-komisijos-SF-TT-0020-0048.xlsx"
TEMPLATE = Path(r"C:\Users\37062\Downloads\Book1.xlsm")
OUT_DIR = ROOT / "output/tutlio-komisijos-sf/pdf"
XLSX_DIR = ROOT / "output/tutlio-komisijos-sf/xlsx-sablonas"
SOFFICE = Path(r"C:\Program Files\LibreOffice\program\soffice.exe")


def load_ss(z: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(f"{NS}si"):
        out.append("".join((t.text or "") for t in si.findall(f".//{NS}t")))
    return out


def cell_val(c, ss):
    t = c.get("t")
    v = c.find(f"{NS}v")
    isel = c.find(f"{NS}is")
    if t == "s" and v is not None:
        return ss[int(v.text)]
    if t == "inlineStr" and isel is not None:
        return "".join((x.text or "") for x in isel.findall(f".//{NS}t"))
    if v is not None:
        return v.text or ""
    return ""


def read_invoices() -> list[dict]:
    z = zipfile.ZipFile(SRC_XLSX)
    ss = load_ss(z)
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {
        rel.get("Id"): rel.get("Target")
        for rel in rels
    }
    invoices = []
    for sh in wb.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheets"):
        name = sh.get("name")
        if not name.startswith("TT "):
            continue
        rid = sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rid_to_target[rid].lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        root = ET.fromstring(z.read(target))
        cells = {}
        for c in root.iter(f"{NS}c"):
            ref = c.get("r")
            if ref:
                cells[ref] = cell_val(c, ss)
        amount = float(cells.get("E16") or 0)
        issue = (cells.get("E4") or "").replace("Dokumento data: ", "")
        buyer = cells.get("D8") or ""
        org_hint = cells.get("B16") or ""
        invoices.append(
            {
                "number": name.replace("TT ", "").strip(),
                "label": cells.get("E3") or f"Serija TT Nr. {name.replace('TT ', '')}",
                "date": issue,
                "buyer": buyer,
                "d9": cells.get("D9") or "",
                "d10": cells.get("D10") or "",
                "d11": cells.get("D11") or "",
                "desc": cells.get("B16") or "Tutlio tarpininkavimo mokestis",
                "amount": amount,
            }
        )
    invoices.sort(key=lambda x: x["number"])
    # type from register
    reg = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    types = {}
    orgs = {}
    for row in reg.findall(f"{NS}sheetData/{NS}row"):
        vals = []
        for c in row.findall(f"{NS}c"):
            vals.append(cell_val(c, ss))
        if len(vals) >= 6 and vals[0] == "TT":
            types[vals[1]] = vals[3]
            orgs[vals[1]] = vals[4]
    for inv in invoices:
        inv["type"] = types.get(inv["number"], "")
        inv["org"] = orgs.get(inv["number"], "")
    return invoices


def set_shared(ss_xml: bytes, mapping: dict[str, str]) -> bytes:
    root = ET.fromstring(ss_xml)
    for si in root.findall(f"{NS}si"):
        texts = si.findall(f".//{NS}t")
        if not texts:
            continue
        cur = "".join((t.text or "") for t in texts)
        if cur in mapping:
            if len(texts) == 1:
                texts[0].text = mapping[cur]
            else:
                texts[0].text = mapping[cur]
                for t in texts[1:]:
                    t.text = ""
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def set_cell_number(root, ref: str, value: float):
    for c in root.iter(f"{NS}c"):
        if c.get("r") == ref:
            c.attrib.pop("t", None)
            v = c.find(f"{NS}v")
            if v is None:
                v = ET.SubElement(c, f"{NS}v")
            v.text = f"{value:.2f}" if ref != "D16" else ("1" if value else "0")
            return


def set_cell_empty_number(root, ref: str):
    for c in root.iter(f"{NS}c"):
        if c.get("r") == ref:
            v = c.find(f"{NS}v")
            if v is not None:
                v.text = "0"
            return


def xml_escape_map(s: str) -> str:
    return s


def fill_template(inv: dict, dest_xlsx: Path):
    mapping = {
        "Serija TT Nr. 0019": inv["label"],
        "Dokumento data: 2026-10-06": f"Dokumento data: {inv['date']}",
        "Agnė Klimantavičienė": inv["buyer"] or " ",
        "Asm k.: 48502240618": inv["d9"] or " ",
        "Individualios veiklos nr.: 939278": inv["d10"] or " ",
        "Tel nr.: +37067775137": inv["d11"] or " ",
        "Administratoriaus mokėstis spalio mėn.": inv["desc"],
        "Korepetitoriaus licencijos mokestis spalio mėn.": "Apmokėta užskaita (Stripe Connect)",
    }
    with zipfile.ZipFile(TEMPLATE) as zin:
        buf = {}
        for item in zin.namelist():
            buf[item] = zin.read(item)
    buf["xl/sharedStrings.xml"] = set_shared(buf["xl/sharedStrings.xml"], mapping)

    sheet = ET.fromstring(buf["xl/worksheets/sheet2.xml"])
    amt = round(float(inv["amount"]), 2)
    set_cell_number(sheet, "C16", amt)
    set_cell_number(sheet, "D16", 1)
    set_cell_number(sheet, "E16", amt)
    set_cell_empty_number(sheet, "C17")
    set_cell_empty_number(sheet, "D17")
    set_cell_empty_number(sheet, "E17")
    set_cell_number(sheet, "E20", amt)
    buf["xl/worksheets/sheet2.xml"] = ET.tostring(sheet, encoding="utf-8", xml_declaration=True)

    wb = buf["xl/workbook.xml"].decode("utf-8")
    wb = wb.replace(
        '<sheet state="visible" name="Sheet1" sheetId="1" r:id="rId5"/>',
        '<sheet state="hidden" name="Sheet1" sheetId="1" r:id="rId5"/>',
    )
    buf["xl/workbook.xml"] = wb.encode("utf-8")

    dest_xlsx.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest_xlsx, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, data in buf.items():
            if name == "xl/vbaProject.bin":
                continue
            zout.writestr(name, data)


LO_PROFILE = ROOT / "output/tutlio-komisijos-sf/_lo-profile"


def convert_pdfs(xlsx_files: list[Path], pdf_dir: Path):
    pdf_dir.mkdir(parents=True, exist_ok=True)
    LO_PROFILE.mkdir(parents=True, exist_ok=True)
    cmd = [
        str(SOFFICE),
        "--headless",
        "--norestore",
        f"-env:UserInstallation=file:///{LO_PROFILE.as_posix()}",
        "--convert-to",
        "pdf:calc_pdf_Export",
        "--outdir",
        str(pdf_dir),
        *[str(p) for p in xlsx_files],
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or "") + (r.stdout or "") or "soffice failed")
    return r.stdout


def slug(s: str) -> str:
    s = re.sub(r'[<>:"/\\|?*]', "", s)
    s = re.sub(r"\s+", "-", s.strip())
    return s[:60] or "sf"


def main():
    invoices = read_invoices()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    XLSX_DIR.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="tutlio-sf-"))
    print("invoices", len(invoices), "tmp", work)

    xlsx_files = []
    for inv in invoices:
        xlsx = XLSX_DIR / f"TT-{inv['number']}.xlsx"
        fill_template(inv, xlsx)
        xlsx_files.append(xlsx)
    print(convert_pdfs(xlsx_files, work))

    for inv in invoices:
        produced = work / f"TT-{inv['number']}.pdf"
        if not produced.exists():
            raise FileNotFoundError(produced)
        kind = "siusti" if inv["type"] == "company" else "nesiusti"
        dest = OUT_DIR / kind / f"TT-{inv['number']}-{slug(inv['buyer'])}-{inv['date']}.pdf"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(produced, dest)
        print("PDF", dest.name, inv["type"], inv["amount"])

    send = [i for i in invoices if i["type"] == "company"]
    keep = [i for i in invoices if i["type"] != "company"]
    print("SEND", len(send), round(sum(i["amount"] for i in send), 2))
    print("KEEP", len(keep), round(sum(i["amount"] for i in keep), 2))


if __name__ == "__main__":
    main()
