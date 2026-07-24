import numpy as np
import pandas as pd
import matplotlib
# Zorgt ervoor dat Matplotlib op de achtergrond bewaart zonder pop-ups
matplotlib.use('Agg') 
import matplotlib.pyplot as plt
from scipy.interpolate import make_interp_spline

# 1. DATA INLADEN
try:
    df = pd.read_csv("perfect_match_momentum.csv")
except FileNotFoundError:
    print("Fout: perfect_match_momentum.csv niet gevonden! Run eerst perfect_momentum.py")
    exit()

# We gebruiken de vloeiende 'Smoothed' data voor een organische vorm
df['Smoothed'] = df['MomentumRaw'].rolling(window=7, min_periods=1, center=True).mean()

# 2. RADIALE TRANSLATIE (TIJD OMZETTEN NAAR EEN CIRKEL)
# We verspreiden de 121 minuten over een cirkel (2 * pi radialen)
theta_raw = np.linspace(0, 2 * np.pi, len(df))

# Voor een zijdezacht resultaat interpoleren we naar 1000 datapunten rond de cirkel
theta_smooth = np.linspace(0, 2 * np.pi, 1000)
Spline = make_interp_spline(theta_raw, df['Smoothed'])
r_smooth = Spline(theta_smooth)

# De basis-straal (de neutrale middellijn waar de spelers beginnen)
base_radius = 50.0
r_visual = base_radius + r_smooth

# 3. KUNSTWERK RENDEREN IN POOLCOÖRDINATEN (POLAR PLOT)
plt.style.use('dark_background')
# HIER ZAT DE FOUT: fig, ax moet beide gedefinieerd worden!
fig, ax = plt.subplots(figsize=(10, 10), subplot_kw={'projection': 'polar'})

# Draai de klok om zodat 0 minuten bovenaan staat (12 uur)
ax.set_theta_offset(np.pi / 2)
ax.set_theta_direction(-1) # Met de klok mee draaien

# Teken de neutrale startcirkel (de nul-lijn)
ax.plot(theta_smooth, np.full_like(theta_smooth, base_radius), color='#1C1C1E', linestyle='-', linewidth=2, zorder=1)

# Vul de Spaanse dominantie (buiten de cirkel)
ax.fill_between(theta_smooth, base_radius, r_visual, where=(r_visual >= base_radius), 
                color='#FF2D55', alpha=0.35, zorder=2)

# Vul de Argentijnse counters (die imploderen naar binnen richting de kern)
ax.fill_between(theta_smooth, base_radius, r_visual, where=(r_visual < base_radius), 
                color='#00AEEF', alpha=0.45, zorder=2)

# De felle witte contourlijn die de hartslag van de wedstrijd tekent
ax.plot(theta_smooth, r_visual, color='#FFFFFF', linewidth=2.5, alpha=0.95, zorder=3)

# 4. HIGHLIGHTS EN MARKERINGEN
# Match begin (0 minuut) bovenaan
ax.annotate('START', xy=(0, base_radius + 5), color='#8E8E93', fontweight='bold', fontsize=9, ha='center')

# De gouden stip van de winnende goal van Ferran Torres in minuut 105
theta_105 = (105 / 121) * 2 * np.pi
r_105 = base_radius + df.loc[105, 'Smoothed']
ax.scatter(theta_105, r_105, color='#FFD700', s=180, zorder=5, edgecolors='white', linewidth=2)

# Trek een subtiele gouden straal/laserlijn vanuit de kern naar de goal toe
ax.plot([theta_105, theta_105], [0, r_105], color='#FFD700', linestyle=':', alpha=0.4, linewidth=1.5)
ax.annotate('TORRES 105\'\n(1-0 GOAL)', xy=(theta_105, r_105 + 15), color='#FFD700', fontweight='bold', fontsize=9, ha='center')

# Rode kaart Enzo Fernández (92 minuut)
theta_92 = (92 / 121) * 2 * np.pi
r_92 = base_radius + df.loc[92, 'Smoothed']
ax.scatter(92, r_92, color='#FF2D55', marker='X', s=120, zorder=5)
ax.annotate('ROOD\nENZO 92\'', xy=(theta_92, r_92 + 15), color='#FF2D55', fontweight='bold', fontsize=8, ha='center')

# 5. KUNSTZINNIGE STYLING (ASSEN STRIPPEN)
ax.grid(False)
ax.set_yticklabels([])
ax.set_xticklabels([])
ax.spines['polar'].set_visible(False)

# Donkere kern in het midden creëren voor diepte
ax.set_ylim(0, base_radius + 35)

# Titel onderaan het kunstwerk zetten
plt.suptitle("THE CIRCLE OF EMOTION", y=0.08, fontsize=14, fontweight='bold', color='#FFFFFF')
plt.title("Visual fingerprint of the 2026 World Cup Finale", y=-0.01, fontsize=10, color='#8E8E93', fontstyle='italic')

plt.tight_layout()

# Sla het resultaat op
output_filename = "match_momentum_circle.png"
plt.savefig(output_filename, dpi=300, bbox_inches='tight')
print(f"Geweldig! Het unieke cirkel-kunstwerk is opgeslagen als '{output_filename}'!")
