![Header](header.png)

# Spurious Correlation: Chocolate Consumption vs. Nobel Prize Winners

Does eating chocolate make a country smarter? An analysis of the famous correlation between per capita chocolate consumption and Nobel Prize winners, inspired by the Messerli (2012) study published in the New England Journal of Medicine.

## About

This notebook explores a strong correlation (r ≈ 0.88) between how much chocolate a country eats and how many Nobel Prize winners it produces per capita. While statistically highly significant (p < 0.0001), this is a textbook example of **confounding variables** — wealth and education spending drive both.

## What's Inside

- Cross-country dataset (14 countries)
- Pearson correlation coefficient calculation
- Labeled scatter plot showing each country
- Statistical significance testing (p-value)
- Regression line with R²
- Discussion of confounders and why correlation ≠ causation

## Key Results

| Metric | Value |
|--------|-------|
| Pearson r | 0.88 |
| P-value | 0.000037 |
| R² | 0.77 |
| Statistically significant? | Yes (p < 0.05) |

## Requirements

```
pandas
matplotlib
scipy
numpy
```

## Usage

```bash
pip install pandas matplotlib scipy numpy
jupyter notebook chocolate_vs_nobel.ipynb
```

## Data Source

Data based on Messerli FH. "Chocolate Consumption, Cognitive Function, and Nobel Laureates." *N Engl J Med* 2012; 367:1562-1564. Analysis code is original.
