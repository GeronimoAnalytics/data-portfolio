![Header](header.png)

# Spurious Correlation Analysis: Pool Drownings vs. Nicolas Cage Films

A data analysis exploring the infamous spurious correlation between swimming pool drownings in the US and the number of Nicolas Cage film appearances (2000–2009).

## About

This project demonstrates why **correlation does not imply causation**. Using real data popularized by [Tyler Vigen](https://tylervigen.com/spurious-correlations), we perform a statistical analysis showing a surprisingly high Pearson correlation (r ≈ 0.75, p = 0.013) between two completely unrelated variables.

## What's Inside

The Jupyter notebook covers:

1. **Data exploration** — summary statistics of both variables
2. **Correlation calculation** — Pearson r using pandas
3. **Dual Y-axis visualization** — time series plot showing both trends
4. **Statistical significance testing** — p-value via scipy.stats.pearsonr
5. **Scatter plot with regression line** — visual relationship + R²
6. **Discussion** — why spurious correlations exist and what causes them

## Key Results

| Metric | Value |
|--------|-------|
| Pearson r | 0.75 |
| P-value | 0.013 |
| R² | 0.56 |
| Statistically significant? | Yes (p < 0.05) |

Despite statistical significance, this is purely coincidental — a classic reminder that data can mislead without proper causal reasoning.

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
jupyter notebook spurious_correlation_analysis.ipynb
```

## Data Source

The data originates from Tyler Vigen's [Spurious Correlations](https://tylervigen.com/spurious-correlations) project. The analysis code is original.
