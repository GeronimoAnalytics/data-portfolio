import numpy as np
import pandas as pd
import matplotlib
# Zorgt ervoor dat Matplotlib geruisloos op de achtergrond bewaart
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
from scipy.interpolate import make_interp_spline

# 1. Laad de dataset in
try:
    df = pd.read_csv("match_timeline_shots.csv", skiprows=1, names=[
        "Minuut", "Land", "Speler", "Uitkomst", "Lichaamsdeel", "Type Aanval"
    ])
except FileNotFoundError:
    print("Fout: match_timeline_shots.csv niet gevonden!")
    exit()

# Dwing de kolom 'Minuut' om echte cijfers te worden
df['Minuut'] = pd.to_numeric(df['Minuut'], errors='coerce').fillna(0).astype(int)

# 2. Bereken het momentum per minuut (van minuut 0 tot 121)
minuten = np.arange(0, 122)
momentum_waarden = np.zeros(122)

for _, row in df.iterrows():
    minuut = int(row['Minuut'])
    if minuut > 121:
        minuut = 121
        
    # We zetten alles om naar kleine letters en strippen spaties weg
    land = str(row['Land']).lower().strip()
    uitkomst = str(row['Uitkomst']).lower().strip()
    
    # Bepaal de impactwaarde van de actie (strakkere gewichten voor betere golven)
    if 'doelpunt' in uitkomst or 'goal' in uitkomst:
        impact = 25
    elif 'saved' in uitkomst:
        impact = 10
    elif 'blocked' in uitkomst:
        impact = 6
    else:
        impact = 4
        
    # VEILIGE CHECK: We zoeken naar 'spa' (Spanje) of 'arg' (Argentinië) om encoding-fouten te omzeilen!
    if 'spa' in land:
        momentum_waarden[minuut] += impact
    elif 'arg' in land:
        momentum_waarden[minuut] -= impact

# 3. Bereken het vloeiende verloop met een rollend venster (window van 12 minuten voor diepe golven)
df_smooth = pd.DataFrame({'Minuut': minuten, 'Momentum': momentum_waarden})
df_smooth['Smoothed'] = df_smooth['Momentum'].rolling(window=12, min_periods=1, center=True).mean()

# Wiskundige Spline voor de vloeiende organische golven
X_Y_Spline = make_interp_spline(df_smooth['Minuut'], df_smooth['Smoothed'])
X_ = np.linspace(df_smooth['Minuut'].min(), df_smooth['Minuut'].max(), 500)
Y_ = X_Y_Spline(X_)

# 4. De visualisatie bouwen (Abstract & Strak)
plt.style.use('dark_background')
fig, ax = plt.subplots(figsize=(14, 7))

# Teken de centrale middellijn
ax.axhline(0, color='#444444', linestyle='--', linewidth=1)

# Vul de gebieden onder de lijn met kleur (Rood vs Blauw)
ax.fill_between(X_, Y_, 0, where=(Y_ >= 0), color='#E31B23', alpha=0.4, label='Spanje Dominantie')
ax.fill_between(X_, Y_, 0, where=(Y_ < 0), color='#74ACDF', alpha=0.4, label='Argentinië Dominantie')

# Teken de hoofdonderzoekslijn
ax.plot(X_, Y_, color='#ffffff', linewidth=2.5, alpha=0.9)

# 5. Markeer cruciale momenten op de tijdlijn
# De winnende goal van Ferran Torres in minuut 105
idx_105 = np.abs(X_ - 105).argmin()
ax.scatter(105, Y_[idx_105], color='#FFD700', s=150, zorder=5, edgecolors='black')
ax.annotate('Ferran Torres 105\' (Goal)', (105, Y_[idx_105] + 0.15), textcoords="offset points", xytext=(0,10), ha='center', color='#FFD700', fontweight='bold')

# De rode kaart van Enzo Fernández in minuut 92
idx_92 = np.abs(X_ - 92).argmin()
ax.scatter(92, Y_[idx_92], color='red', marker='X', s=100, zorder=5)
ax.annotate('Rood Enzo 92\'', (92, Y_[idx_92] - 0.25), textcoords="offset points", xytext=(0,-15), ha='center', color='red', fontweight='bold')

# 6. Styling van de grafiek
ax.set_title("WK FINALE 2026: WEDSTRIJD MOMENTUM & DRUKVERLOOP", fontsize=16, fontweight='bold', pad=20, color='#ffffff')
ax.set_xlabel("Minuut in de wedstrijd", fontsize=12, labelpad=10)
ax.set_ylabel("← Argentinië druk | Spanje druk →", fontsize=12, labelpad=10)
ax.set_xlim(0, 121)

# Schaal dynamisch instellen op basis van de echte berekende pieken
max_y = max(abs(Y_.min()), abs(Y_.max())) + 0.3
if max_y < 0.5:  # Fallback als er onverhoopt nog steeds niks geladen wordt
    max_y = 2.0
ax.set_ylim(-max_y, max_y)

# Voeg subtiele verticale lijnen toe voor de helften en verlenging
ax.axvline(45, color='#333333', alpha=0.5)
ax.axvline(90, color='#333333', alpha=0.5)
ax.text(22, max_y - 0.2, "1e Helft", color='#888888', ha='center')
ax.text(67, max_y - 0.2, "2e Helft", color='#888888', ha='center')
ax.text(105, max_y - 0.2, "Verlenging", color='#888888', ha='center')

# Verwijder de box-lijntjes voor een abstracte look
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#333333')
ax.spines['bottom'].set_color('#333333')

plt.tight_layout()

# Sla het resultaat op
plt.savefig("wedstrijd_momentum.png", dpi=300)
print("Succes! De visualisatie is succesvol overschreven.")
