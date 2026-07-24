import pandas as pd
import json
import base64

# 1. LAAD DE DATASET IN
try:
    df = pd.read_csv("perfect_match_momentum.csv")
    df['Smoothed'] = df['MomentumRaw'].rolling(window=6, min_periods=1, center=True).mean()
    match_data = df[['Minuut', 'MomentumRaw', 'Smoothed']].to_dict(orient='records')
except FileNotFoundError:
    print("Fout: perfect_match_momentum.csv niet gevonden! Run eerst perfect_momentum.py")
    exit()

json_data = json.dumps(match_data)

# 1b. VOETBALVELD ALS BASE64 INLADEN (zodat de HTML zelfstandig blijft werken)
with open("veld.png", "rb") as img_file:
    pitch_b64 = base64.b64encode(img_file.read()).decode("utf-8")

# 2. START DE HTML EN DE STIJL (CSS MET MEER ADEMRUIMTE)
html_start = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>Data Portrait — Spain vs Argentina 2026</title>
    <style>
        body {{
            margin: 0; padding: 0; background-color: #F9F9FB; /* Galerie-wit */
            display: flex; flex-direction: column; justify-content: center;
            align-items: center; min-height: 100dvh; overflow-x: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; user-select: none;
            box-sizing: border-box;
        }}

        *, *::before, *::after {{ box-sizing: inherit; }}

        #scene-wrap {{
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transform-origin: top center;
            --scene-scale: 1;
        }}
        
        /* SPACING UPDATE: canvas-container iets minder hoog en flinke margin-bottom gegeven */
        #canvas-container {{
            position: relative; 
            width: 850px; 
            height: 640px; /* Iets minder hoog gemaakt om de cirkel optisch omhoog te duwen */
            margin-bottom: 28px; /* Extra fysieke ademruimte gecreëerd boven de knoppen */
            display: flex; justify-content: center; align-items: center;
            transform: scale(var(--scene-scale));
            transform-origin: top center;
        }}

        /* Voetbalveld op de achtergrond, gecentreerd op exact hetzelfde middelpunt als het canvas */
        #pitch-bg {{
            position: absolute;
            left: 425px;   /* canvas.width/2 */
            top: 365px;    /* canvas.height/2 (425) min de -60px canvas-shift */
            transform: translate(-50%, -50%);
            width: 920px;
            height: auto;
            opacity: 0.34;
            filter: saturate(0.85) contrast(0.95);
            z-index: 1;
            pointer-events: none;
            border-radius: 8px;
        }}
        
        /* Het canvas transformeren we een klein stukje omhoog voor betere balans */
        canvas {{ 
            position: absolute; 
            top: -60px; /* Canvas 60 pixels omhoog getrokken */
            left: 0; 
            z-index: 2; 
        }}
        
        /* Centrale Teller (beweegt exact mee omhoog met het canvas) */
        #center-counter {{ 
            position: absolute; text-align: center; z-index: 10; 
            color: #1C1C1E; pointer-events: none;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            width: 200px; height: 200px;
            top: 220px; /* Perfect uitgelijnd met het verschoven canvas */
        }}
        
        #central-flags {{
            display: flex; gap: 16px; margin-bottom: 2px; align-items: center; justify-content: center;
        }}
        .mini-flag {{
            width: 22px; height: 22px; border-radius: 50%; border: 1px solid #E5E5EA;
            background-size: cover; background-position: center; box-shadow: 0 2px 6px rgba(0,0,0,0.06);
        }}
        #flag-esp {{ background: linear-gradient(#E31B23 25%, #FFD800 25%, #FFD800 75%, #E31B23 75%); }}
        #flag-arg {{ background: linear-gradient(#74ACDF 33%, #FFFFFF 33%, #FFFFFF 66%, #74ACDF 66%); }}
        
        #minute-text {{ font-size: 46px; font-weight: 800; margin: 0; line-height: 1.1; letter-spacing: -1px; }}
        #stage-text {{ font-size: 10px; font-weight: bold; color: #8E8E93; letter-spacing: 1.5px; margin-top: 2px; }}
        
        #controls {{ margin-top: 0px; z-index: 20; }}
        #playBtn {{ 
            background: transparent; border: 1px solid #AEAEB2; color: #1C1C1E; 
            padding: 8px 28px; font-size: 11px; font-weight: bold; letter-spacing: 2px; 
            border-radius: 4px; cursor: pointer; transition: all 0.2s ease; outline: none; 
        }}
        #playBtn:hover {{ background: #1C1C1E; color: #F9F9FB; border-color: #1C1C1E; }}
        
        #description-block {{
            margin-top: 20px; max-width: 540px; text-align: center; z-index: 5;
            color: #636366; font-size: 11.5px; line-height: 1.6; font-weight: 400;
        }}
        #description-block strong {{ color: #1C1C1E; font-weight: 600; }}
        
        #title-overlay {{ margin-top: 15px; text-align: center; color: #AEAEB2; font-size: 10px; letter-spacing: 2px; font-weight: bold; z-index: 5; }}

        @media (max-width: 980px) {{
            body {{
                justify-content: flex-start;
                padding: 16px 12px 28px;
            }}

            #description-block {{
                max-width: min(92vw, 540px);
                font-size: 11px;
                line-height: 1.55;
            }}

            #title-overlay {{
                letter-spacing: 1.4px;
            }}
        }}

        @media (max-width: 560px) {{
            #playBtn {{
                padding: 8px 18px;
                font-size: 10px;
                letter-spacing: 1.2px;
            }}

            #description-block {{
                margin-top: 14px;
                font-size: 10.5px;
            }}

            #title-overlay {{
                font-size: 9px;
                letter-spacing: 1px;
            }}
        }}
    </style>
</head>
<body>
    <div id="scene-wrap">
        <div id="canvas-container">
            <img id="pitch-bg" src="data:image/png;base64,{pitch_b64}" alt="pitch">
            <canvas id="portraitCanvas" width="850" height="850"></canvas>
            
            <div id="center-counter">
                <div id="central-flags">
                    <div id="flag-esp" class="mini-flag"></div>
                    <div id="flag-arg" class="mini-flag"></div>
                </div>
                <div id="minute-text">0'</div>
                <div id="stage-text">1ST HALF</div>
            </div>
        </div>

        <div id="controls"><button id="playBtn">PAUSE</button></div>
        <div id="description-block">
            This generative data portrait translates the 121-minute emotional arc of the <strong>2026 FIFA World Cup Final</strong> into an abstract radial heartbeat. The upper red aura represents Spain's suffocating high-pressure dominance, while the lower blue aura captures Argentina's rapid, sharp counter-attacks. As tactical momentum shifts, the dominating side physically suffocates and compresses the defending opponent towards the center. The deep black vector line charts the continuous friction of the match, crowned by Enzo Fernández's red card in the 92nd minute and Ferran Torres' golden championship-winning goal at the 105th minute.
        </div>
        <div id="title-overlay">DATA PORTRAIT — THE HEARTBEAT OF A FINALE</div>
    </div>
"""
html_js = f"""
    <script>
        const matchData = {json_data};
        const sceneWrap = document.getElementById('scene-wrap');
        const baseSceneWidth = 850;
        const baseSceneHeight = 640;
        const canvas = document.getElementById('portraitCanvas'); const ctx = canvas.getContext('2d');
        const playBtn = document.getElementById('playBtn');
        let currentIdx = 0; let baseRadius = 200; let maxMinutes = 121;
        let points = []; let frameCount = 0; let isPlaying = true; let framesPerMinute = 5; 

        function updateResponsiveScale() {{
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const horizontalPadding = viewportWidth <= 560 ? 20 : 28;
            const verticalPadding = viewportWidth <= 980 ? 220 : 190;

            const scaleX = (viewportWidth - horizontalPadding) / baseSceneWidth;
            const scaleY = (viewportHeight - verticalPadding) / baseSceneHeight;
            const nextScale = Math.min(1, scaleX, scaleY);

            sceneWrap.style.setProperty('--scene-scale', Math.max(0.56, nextScale).toFixed(4));
        }}

        window.addEventListener('resize', updateResponsiveScale);

        playBtn.addEventListener('click', () => {{
            if (playBtn.innerText === "REPLAY") {{
                currentIdx = 0; points = []; frameCount = 0; isPlaying = true; playBtn.innerText = "PAUSE"; tick();
            }} else {{
                isPlaying = !isPlaying; playBtn.innerText = isPlaying ? "PAUSE" : "PLAY"; if (isPlaying) tick();
            }}
        }});

        function tick() {{ if (!isPlaying) return; draw(); requestAnimationFrame(tick); }}

        function draw() {{
            frameCount++; ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2);

            let currentData = matchData[currentIdx];
            let minuut = currentData.Minuut; let smoothMom = currentData.Smoothed;
            let spainActive = smoothMom >= 0; let intensity = Math.abs(smoothMom);

            document.getElementById('minute-text').innerText = minuut + "'";
            document.getElementById('stage-text').innerText = minuut < 45 ? "1ST HALF" : (minuut < 90 ? "2ND HALF" : "EXTRA TIME");

            let pulseSpain = spainActive ? Math.sin(frameCount * (0.07 + intensity * 0.015)) * 22 : Math.sin(frameCount * 0.04) * 6;
            let pulseArg = !spainActive ? Math.sin(frameCount * (0.07 + intensity * 0.015)) * 22 : Math.sin(frameCount * 0.04) * 6;

            // Victory boost: vanaf minuut 100 loopt het rood van Spanje geleidelijk feller op richting het slotfluitsignaal
            let finaleBoost = Math.max(0, Math.min(1, (minuut - 100) / 21));
            
            let angle = (minuut / maxMinutes) * (Math.PI * 2) - (Math.PI / 2); 
            let currentRadius = baseRadius + smoothMom * 2.2;
            
            if (points.length <= currentIdx) points.push({{ angle: angle, radius: currentRadius }});

            let crushFactor = Math.min(45, intensity * 0.5);

            ctx.save();
            ctx.rotate(-Math.PI / 2);

            // Spanje deken (Boven) — nu met een radiale gradient i.p.v. platte kleur, feller richting het slot (overwinning)
            let alphaSpain = (spainActive ? Math.min(0.80, 0.40 + (intensity / 80)) : 0.20) + finaleBoost * 0.15;
            alphaSpain = Math.min(0.95, alphaSpain);
            let sizeSpain = baseRadius + (spainActive ? (smoothMom * 1.2) + pulseSpain * 0.5 : -crushFactor);
            ctx.save();
            if (spainActive || finaleBoost > 0) {{
                ctx.shadowBlur = 18 + finaleBoost * 22; ctx.shadowColor = `rgba(255, 45, 85, ${{0.35 + finaleBoost * 0.25}})`;
            }}
            ctx.beginPath(); ctx.arc(0, 0, sizeSpain, 0, Math.PI, true);
            let gradSpain = ctx.createRadialGradient(0, 0, baseRadius * 0.35, 0, 0, Math.max(sizeSpain, 1));
            gradSpain.addColorStop(0,    `rgba(255, ${{Math.round(168 - finaleBoost * 30)}}, ${{Math.round(140 - finaleBoost * 60)}}, ${{alphaSpain * 0.55}})`);
            gradSpain.addColorStop(0.45,`rgba(255, ${{Math.round(90 - finaleBoost * 35)}}, ${{Math.round(70 - finaleBoost * 40)}}, ${{alphaSpain * 0.9}})`);
            gradSpain.addColorStop(0.8, `rgba(255, ${{Math.round(45 - finaleBoost * 20)}}, ${{Math.round(40 - finaleBoost * 25)}}, ${{alphaSpain}})`);
            gradSpain.addColorStop(1,   `rgba(${{Math.round(178 + finaleBoost * 45)}}, ${{Math.round(20 + finaleBoost * 20)}}, 24, ${{alphaSpain * 0.9}})`);
            ctx.fillStyle = gradSpain; ctx.fill();
            ctx.restore();

            // Argentinië deken (Onder) — zelfde behandeling, blauwe tint + eigen glow
            let alphaArg = !spainActive ? Math.min(0.80, 0.40 + (intensity / 80)) : 0.20;
            let sizeArg = baseRadius + (!spainActive ? (Math.abs(smoothMom) * 1.2) + pulseArg * 0.5 : -crushFactor);
            ctx.save();
            if (!spainActive) {{
                ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(0, 122, 255, 0.35)';
            }}
            ctx.beginPath(); ctx.arc(0, 0, sizeArg, 0, Math.PI, false);
            let gradArg = ctx.createRadialGradient(0, 0, baseRadius * 0.35, 0, 0, Math.max(sizeArg, 1));
            gradArg.addColorStop(0,    `rgba(150, 200, 255, ${{alphaArg * 0.55}})`);
            gradArg.addColorStop(0.45,`rgba(70, 150, 245, ${{alphaArg * 0.9}})`);
            gradArg.addColorStop(0.8, `rgba(0, 122, 255, ${{alphaArg}})`);
            gradArg.addColorStop(1,   `rgba(10, 60, 140, ${{alphaArg * 0.9}})`);
            ctx.fillStyle = gradArg; ctx.fill();
            ctx.restore();
            
            ctx.restore();

            // Diepzwarte contourlijn
            if (points.length > 1) {{
                ctx.beginPath(); ctx.moveTo(Math.cos(points.angle) * points.radius, Math.sin(points.angle) * points.radius);
                for (let i = 1; i < points.length; i++) ctx.lineTo(Math.cos(points[i].angle) * points[i].radius, Math.sin(points[i].angle) * points[i].radius);
                ctx.strokeStyle = 'rgba(28, 28, 30, 0.95)'; ctx.lineWidth = 3.5; ctx.stroke();
            }}
            
            // Antraciet baseline
            ctx.beginPath(); ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = '#48484A'; ctx.lineWidth = 2.0; ctx.stroke();

            // Highlights
            for (let i = 0; i < points.length; i++) {{
                if (i === 92) drawMarker(points[i].angle, points[i].radius, '#FF3B30', 9, '#FFFFFF');
                if (i === 105) drawMarker(points[i].angle, points[i].radius, '#FFCC00', 14, '#1C1C1E');
            }}

            // Schone binnenring
            ctx.beginPath(); ctx.arc(0, 0, baseRadius * 0.72 - (spainActive ? crushFactor * 0.2 : 0), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(249, 249, 251, 0.5)'; ctx.fill(); ctx.restore();

            if (frameCount % framesPerMinute === 0) {{
                if (currentIdx < matchData.length - 1) currentIdx++; else {{ isPlaying = false; playBtn.innerText = "REPLAY"; }}
            }}
        }}

        function drawMarker(angle, radius, color, size, strokeColor) {{
            let x = Math.cos(angle) * radius; let y = Math.sin(angle) * radius;
            ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
            ctx.strokeStyle = strokeColor; ctx.lineWidth = 2.5; ctx.stroke();
        }}
        window.onload = function() {{ updateResponsiveScale(); tick(); }};
    </script>
</body>
</html>
"""

# COMBINEER EN SCHRIJF WEG
with open("match_portrait.html", "w", encoding="utf-8") as f:
    f.write(html_start + html_js)

print("Succes! Radiale gradients + voetbalveld-achtergrond toegevoegd.")