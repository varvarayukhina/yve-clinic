"""Обновить прайс сайта из онлайн-записи YCLIENTS.

    uv run --with beautifulsoup4 python tools/update_prices.py

Открывает страницу записи в headless Chrome, читает услуги и пишет site/assets/services.js.
Запускать после каждого изменения цен или услуг в YCLIENTS: цены на сайте должны совпадать (ПП № 736).
"""
import json, re, subprocess, sys, tempfile, pathlib
from bs4 import BeautifulSoup

URL = "https://n1676841.yclients.ru/company/1501872/personal/select-services?o="
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = pathlib.Path(__file__).resolve().parent.parent / "site/assets/services.js"

SLUG = {
    "Выгодные предложения": "kompleksy", "Консультации": "konsultacii", "Трихология": "trihologiya",
    "Эстетика лица": "estetika-lica", "Капельницы": "kapelnicy", "Ботулинотерапия": "botulinoterapiya",
    "Контурная пластика": "konturnaya-plastika", "Биоревитализация и мезотерапия": "biorevitalizaciya",
    "Коллагеностимуляция": "kollagenostimulyaciya", "Фототерапия (INMODE LUMECCA)": "fototerapiya",
    "SMAS‑лифтинг (ULTRAFORMER MPT)": "smas-lifting", "Эпиляция (INMODE DIOLAZE XL)": "epilyaciya",
    "Игольчатый RF (VIVACE)": "igolchatyj-rf", "Биполярный RF (FORMA)": "bipolyarnyj-rf",
    "Монополярный RF (VOLNEWMER)": "monopolyarnyj-rf", "Тулиевый лазер (LASEMD ULTRA)": "tulievyj-lazer",
    "Фотодинамическая терапия (REVIXAN)": "fotodinamicheskaya-terapiya",
}
# ФЗ «О рекламе» ст. 5, 24: без гарантий результата, «идеально», «максимально», «без реабилитации»
SOFTEN = {
    "Эффективное снижение потливости подмышек и ладоней": "Снижение потливости подмышек и ладоней",
    "Эффективное разглаживание морщин, придающее лицу свежий и отдохнувший вид": "Разглаживание мимических морщин",
    "Идеально подходит для тонкой коррекции или зональных изменений": "Для тонкой коррекции отдельных зон",
    "Для необходимого рассчёта": "Цена за единицу, количество определяет врач",
    "Идеально перед важным событием: глубокое очищение, лёгкий пилинг, маска по типу кожи": "Перед важным событием: очищение, лёгкий пилинг, маска по типу кожи",
    "Безинъекционное обновление кожи без периода реабилитации": "Безинъекционное обновление кожи",
    "Индивидуальный протокол очищения для максимального комфорта и результата": "Индивидуальный протокол очищения",
    "Максимальный лифтинг‑эффект": "Самый объёмный протокол",
    "Максимальная гладкость: ноги, руки, зона бикини, подмышечные впадины, ягодицы": "Ноги, руки, зона бикини, подмышечные впадины, ягодицы",
    "Полное избавление от нежелательных волос на самых востребованных зонах": "Самые востребованные зоны за один визит",
    "Идеальная гладкость голеней": "Удаление волос на голенях",
    "Долговременная гладкость и комфорт": "Удаление волос в зоне подмышек",
    "Гладкость кожи рук без раздражения": "Удаление волос на руках",
    "Избавление от пигментации и ровный тон кожи": "Работа с пигментацией и тоном кожи",
    "Снижение потливости с длительным эффектом": "Снижение потливости",
    "Стойкий лифтинг и глубокое увлажнение": "Лифтинг и глубокое увлажнение",
    "Гармоничные пропорции, долговременный эффект увлажнения": "Гармоничные пропорции и увлажнение",
    "Максимальная зона воздействия с выраженным лифтингом, уплотнением кожи, коррекцией контуров, прогрев глубоких слоёв": "Большая зона воздействия: лифтинг, уплотнение кожи, коррекция контуров, прогрев глубоких слоёв",
}


def dump_dom() -> str:
    with tempfile.TemporaryDirectory() as prof:
        return subprocess.run([CHROME, "--headless=new", f"--user-data-dir={prof}", "--disable-gpu",
                               "--window-size=1280,4000", "--virtual-time-budget=20000", "--dump-dom", URL],
                              capture_output=True, text=True, check=True, timeout=120).stdout


def main() -> None:
    soup = BeautifulSoup(dump_dom(), "html.parser")
    text = lambda el: re.sub(r"\s+", " ", el.get_text(" ", strip=True).replace("\xa0", " ")).strip() if el else ""
    out, softened = [], set()
    for n, block in enumerate(soup.select('[data-locator="y-core-collapse-item"]')):
        title = re.sub(r"\s+", " ", block.get_text("\n", strip=True).split("\n")[0].replace("\xa0", " "))
        items = []
        for name in block.select('[data-locator="service_title"]'):
            card = name
            while not card.select_one('[data-locator="service_price"]'):
                card = card.parent
            desc = text(card.select_one('[data-locator="service_description"]'))
            if desc in SOFTEN:
                softened.add(desc)
                desc = SOFTEN[desc]
            price = int(re.sub(r"\D", "", text(card.select_one('[data-locator="service_price"]'))))
            items.append({"n": text(name), "d": desc, "t": text(card.select_one('[data-locator="service_seance_length"]')), "p": price})
        if title not in SLUG:
            print(f"Новая категория «{title}»: добавьте ей адрес в SLUG", file=sys.stderr)
        out.append({"id": SLUG.get(title, f"cat-{n}"), "title": title, "items": items})
    total = sum(len(c["items"]) for c in out)
    before = OUT.read_text().count('"n":') if OUT.exists() else 0
    if total < before * 0.9 and "--force" not in sys.argv:
        sys.exit(f"YCLIENTS отдал {total} услуг, а на сайте {before}: похоже, страница прогрузилась не целиком. "
                 "services.js не тронут. Запустите ещё раз; если услуги правда удалили — добавьте --force")
    for d in set(SOFTEN) - softened:
        print(f"Формулировка больше не встречается в YCLIENTS: «{d}»", file=sys.stderr)
    for c in out:
        for i in c["items"]:
            if re.search(r"идеальн|максимальн|гарантир|эффективн|без реабилитации|навсегда", i["d"], re.I):
                print(f"Проверьте формулировку (ФЗ «О рекламе»): {i['n']} — «{i['d']}»", file=sys.stderr)
    OUT.write_text("// Прайс из YCLIENTS (n1676841). Сгенерирован tools/update_prices.py — руками не править.\n"
                   "window.CATALOG = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
    print(f"{OUT}: категорий {len(out)}, услуг {sum(len(c['items']) for c in out)}")


if __name__ == "__main__":
    main()
