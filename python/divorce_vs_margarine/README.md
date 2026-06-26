![Header](header.png)

# Spurious Correlation: Divorce Rate in Maine vs. Margarine Consumption

An analysis of the near-perfect spurious correlation between the divorce rate in Maine and per capita margarine consumption in the US (2000–2009), inspired by [Tyler Vigen's Spurious Correlations](https://tylervigen.com/spurious-correlations).

## About

This notebook explores an almost perfect correlation (r ≈ 0.99) between two completely unrelated variables: how many people divorce in Maine and how much margarine Americans eat. Both variables happened to decline at nearly identical rates during 2000–2009.

This is perhaps the most famous example from Tyler Vigen's collection — a powerful demonstration that even r = 0.99 with p < 0.001 means nothing without a causal mechanism.

## What's Inside

- Dataset exploration with pandas
- Pearson correlation coefficient calculation
- Dual Y-axis time series visualization
- Statistical significance testing (p-value)
- Scatter plot with regression line
- Discussion of correlation vs. causation

## Key Results

| Metric | Value |
|--------|-------|
| Pearson r | 0.9926 |
| P-value | < 0.000001 |
| R² | 0.99 |
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
jupyter notebook divorce_vs_margarine.ipynb
```

## Data Source

Data from Tyler Vigen's [Spurious Correlations](https://tylervigen.com/spurious-correlations). Analysis code is original.
