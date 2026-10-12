import requests
from bs4 import BeautifulSoup


URL = "https://sugang.konkuk.ac.kr/sugang/jsp/search/searchMainOuter.jsp"

headers = {
    "User-Agent": (
        "Mozilla/5.0 "
        "(X11; Linux x86_64; rv:157.0) "
        "Gecko/20100101 Firefox/157.0"
    )
}

with requests.Session() as session:
    r = session.get(URL, headers=headers, timeout=30)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")

    selects = soup.find_all("select")

    print(f"select count: {len(selects)}")
    print()

    for select in selects:
        print("=" * 70)
        print(
            "id   =", select.get("id"),
            "name =", select.get("name"),
        )

        options = select.find_all("option")

        print("option count:", len(options))

        for option in options:
            print(
                repr(option.get("value")),
                "=>",
                option.get_text(" ", strip=True),
            )

        print()
