# EU dev pay vs cost of living

How much a software engineer keeps each month after tax, rent and everyday costs in 60 European cities, at junior, mid-level and senior pay.

Live page: https://offcrazyfreak.github.io/eu-dev-pay/

The page has three charts: money left each month, the gross salary you need to keep €1,500 a month, and a per-city breakdown of where the money goes. Each city opens into its pay table, every cost, special tax rules and the sources behind the numbers.

## Data

City data lives in `data/*.json`, one file per group of countries. Money is in euros per month, except `gross_yearly`, which is per year. After editing a file, rebuild the bundle the page loads:

```sh
python3 build-data.py
```

The figures were compiled on 2026-11-12 and are estimates, not offers. Junior pay and bonus rates rest on thin samples or assumptions. If you spot a wrong number, open an issue with a source.

## Running locally

Open `index.html` in a browser. There is no build step besides `build-data.py`.
