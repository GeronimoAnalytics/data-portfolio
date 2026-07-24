# Data Portrait: World Cup Final 2026 - Spain vs Argentina

*Catching the World Cup Final in a pulsing heartbeat*

An interactive data visualization capturing the tension, pressure, and momentum shifts of the 2026 FIFA World Cup Final between Spain and Argentina (Spain won 1-0 after extra time). Instead of static tables, this project tells the story of 121 minutes of football through an animated radial timeline that **beats like a heart**.

## 🎯 The Concept

Football matches are more than scores—they're battles of momentum and pressure. This visualization transforms minute-by-minute match events into a living, breathing data portrait where you can literally see which team controlled the game at every moment.

### How It Works

**The Radial Timeline:**
- Time moves **clockwise** like a clock, starting at 12 o'clock
- 121 total minutes (including extra time) arranged in a complete circle
- Spain dominates the **top half** (red), Argentina takes the **bottom half** (blue)

**The Heartbeat Effect:**
- Both sides "pulse" with their momentum
- The brighter the aura, the more momentum that team has
- The faster the heartbeat, the more aggressive the attacking threat
- When Spain pushes forward, the red aura visibly expands and pushes the blue side backward toward center

**The Pressure Visualization:**
- Every attacking action creates a visual surge: shots, dangerous passes, interceptions
- A sideways pass in your own half barely moves the needle (+1 momentum)
- A sharp through-ball into the box or a shot on target aggressively pushes the curve up (or down)

**Key Turning Points (Anchored):**
- Enzo Fernández's red card (92') - marked as a critical moment
- Ferran Torres' golden, championship-winning goal (105') - the climax

## 📊 The Data & Tech Stack

### Data Source
- **Minute-by-minute timeline**: 0 to 121 minutes
- **Match events**: Official shots, pass completion in final third, interceptions, Expected Goals (xG)
- **Match Momentum Index**: Each data point represents attacking threat and pressure

### Processing Pipeline
1. **Python Data Pipeline**:
   - `momentum_plot.py` - Core momentum calculation and smoothing
   - `momentum_animation.py` - Generates frame-by-frame animation data
   - `momentum_circle.py` - Creates the radial timeline structure

2. **Mathematical Smoothing**: Rolling average applied to raw event data for fluid, natural curves

3. **Frontend Visualization**: 
   - **HTML5 Canvas** - High-performance rendering
   - **CSS Animations** - Smooth transitions and heartbeat effects
   - Standalone webpage: `match_portrait.html`

### Files Included

**Data Files:**
- `fifa_wk_finale_2026_stats.csv` - Overall match statistics
- `fifa_wk_finale_spanje_stats.csv` - Spain-specific event log
- `match_timeline_shots.csv` - Shot-by-shot breakdown
- `perfect_match_momentum.csv` - Processed momentum index (0-121 minutes)

**Code:**
- `momentum_plot.py` - Momentum calculation & visualization prep
- `momentum_animation.py` - Animation frame generation
- `momentum_circle.py` - Radial timeline computation

**Visualization:**
- `match_portrait.html` - Standalone interactive webpage
- `esparg.gif` - Animated preview
- `header.png` - Key moments header image
- `veld.png` - Football field reference asset

## 🎨 Key Insights

### Spain's Control
Spain dominated possession and attacking momentum throughout the match. The visualization shows a consistent red aura dominance, especially in the second half leading to the decisive goal.

### Argentina's Struggle
Despite being World Cup holders, Argentina struggled to maintain momentum. The blue aura remains mostly compressed toward the center, indicating defensive pressure and limited attacking opportunities.

### The Turning Point
The red card (92') and the subsequent golden goal (105') are locked as physical anchors in the visualization—moments when the match's entire trajectory shifted.

### The Verdict
As a data fingerprint, this visualization clearly shows: **Spain didn't leave Argentina a real chance.**

## 🚀 How to Use

1. **Open the interactive visualization**:
   ```bash
   # Open in your browser
   match_portrait.html
   ```

2. **Explore the data**:
   - Follow the radial timeline clockwise
   - Watch how momentum pulses with each attacking action
   - Observe how pressure shifts between teams
   - Notice the key turning points locked in the circle

3. **Regenerate the visualization** (if modifying data):
   ```bash
   python momentum_plot.py
   python momentum_circle.py
   python momentum_animation.py
   ```

## 💡 Technical Highlights

- **Minimalist Design**: Clean, focused visual language—no clutter, just data
- **Real-Time Smoothing**: Rolling averages prevent jittery transitions
- **Performance Optimized**: Canvas rendering ensures smooth animation on any browser
- **Data-Driven Art**: Every pixel represents an actual match event
- **Radial Encoding**: Circular layout naturally suits time-series data with cyclic patterns

## 📈 Data Structure

The momentum calculation considers:
- **Shots on target** (high impact)
- **Pass completion in final third** (building pressure)
- **Interceptions** (defensive solidity)
- **Expected Goals (xG)** (attacking quality)

Each minute is scored on a momentum index, smoothed, and then mapped to the radial visualization for intuitive visual storytelling.

## 🎬 What This Demonstrates

This project showcases the intersection of:
- **Sports Analytics**: Understanding match dynamics through data
- **Data Visualization**: Transforming raw numbers into compelling visual stories
- **Creative Coding**: Using Python + HTML5 Canvas for artistic expression
- **Interactive Design**: Creating engaging experiences with data

> *"The best data visualizations don't just show numbers—they tell stories. This one tells the story of a World Cup Final through the pulse of momentum."*

---

**Tools & Libraries:**
- Python (data processing)
- Pandas (data transformation)
- HTML5 Canvas (rendering)
- CSS3 (animations)

**Credits:**
- Match data sourced from official FIFA records
- Momentum Index methodology custom-built for this project
