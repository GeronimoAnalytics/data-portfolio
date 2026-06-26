![Header](header.png)

# Spurious Correlation: Las Vegas Weddings vs. Polar Bear Activity

Do weddings in Las Vegas activate polar bears? A monthly analysis showing how shared **seasonality** creates extremely strong but completely meaningless correlations.

## About

This notebook explores a near-perfect correlation (r ≈ 0.95) between the number of Las Vegas weddings and polar bear active hours at San Diego Zoo — both following the same seasonal cycle (peak in summer, low in winter).

This is a textbook example of **seasonal confounding**: two unrelated phenomena that both happen to peak in summer will always appear correlated.

## What's Inside

- Monthly dataset (12 months)
- Pearson correlation coefficient calculation
- Dual Y-axis time series visualization
- Statistical significance testing (p-value)
- Scatter plot with regression line and month labels
- Discussion of seasonality as a confounder

## Key Results

| Metric | Value |
|--------|-------|
| Pearson r | 0.95 |
| P-value | 0.000003 |
| R² | 0.90 |
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
jupyter notebook vegas_weddings_vs_polar_bears.ipynb
```

## The Lesson

Always check for seasonal/cyclical confounders! Any two variables that peak in summer (ice cream sales, drownings, tourism, outdoor activity) will appear highly correlated with each other.
