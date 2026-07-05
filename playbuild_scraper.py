import os
import re
import sys
import json
import time
import requests
from io import BytesIO
from PIL import Image
from bs4 import BeautifulSoup

# Ensure stdout handles UTF-8 correctly
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GENRES = {
    "horror": {"name": "Horror", "tag_id": 1667},
    "action": {"name": "Action", "tag_id": 19},
    "rpg": {"name": "RPG", "tag_id": 122},
    "strategy": {"name": "Strategy", "tag_id": 9},
    "simulation": {"name": "Simulation", "tag_id": 599},
    "puzzle": {"name": "Puzzle", "tag_id": 1664},
    "adventure": {"name": "Adventure", "tag_id": 21}
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

COOKIES = {
    "birthtime": "28801",
    "lastagecheckage": "1-0-1990",
    "wants_mature_content": "1",
}

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Standard Fallback blueprints when Gemini API is unavailable
FALLBACK_BLUEPRINTS = {
    "horror": {
        "blueprint": [
            {"section": "Atmospheric Hook", "description": "Immediate visceral description designed to evoke dread, isolation, or mystery in the first 2 sentences.", "avg_percent": "15%"},
            {"section": "The Threat", "description": "Introduce the antagonist, monster, paranormal entity, or psychological hazard pursuing the player.", "avg_percent": "20%"},
            {"section": "Core Loop", "description": "Detail survival mechanics: hiding, resource management, exploration, light sources, and escape conditions.", "avg_percent": "35%"},
            {"section": "Key Features", "description": "Bullet-point list: psychological elements, multiple endings, voice acting, retro aesthetics, and play duration.", "avg_percent": "30%"}
        ],
        "key_phrases": ["escape the nightmare", "uncover the dark truth", "limited resources", "will you survive", "lurking in the dark"],
        "common_features": ["Exploration", "Resource Management", "Puzzles", "Stealth", "Psychological Elements"]
    },
    "action": {
        "blueprint": [
            {"section": "Adrenaline Hook", "description": "High-impact sentence describing the player's core combat power, weapon arsenal, or movement mechanics.", "avg_percent": "20%"},
            {"section": "The War Zone", "description": "Introduce the battlefield, enemy factions, and level progression structures.", "avg_percent": "25%"},
            {"section": "Combat Depth", "description": "Explain gameplay mechanics: combos, upgrades, skill trees, movement capabilities, and weapon choices.", "avg_percent": "35%"},
            {"section": "Key Features", "description": "Bullet-point list: customizable loadouts, boss battles, game modes (PvP/Co-op), and high-framerate support.", "avg_percent": "20%"}
        ],
        "key_phrases": ["fast-paced combat", "master your arsenal", "intense boss fights", "upgrade your gear", "unleash devastating attacks"],
        "common_features": ["Skill Tree", "Boss Battles", "Upgrades", "Combos", "Weapon Variety"]
    },
    "rpg": {
        "blueprint": [
            {"section": "Narrative Hook", "description": "Introduction to the rich fantasy world, prophecy, faction war, or central lore choice.", "avg_percent": "25%"},
            {"section": "Character Choice", "description": "Focus on player agency: classes, races, skill paths, customization, and background stats.", "avg_percent": "20%"},
            {"section": "Quest & Exploration", "description": "Detail main campaigns, side quests, companions, turn-based/real-time combat, and dialogue options.", "avg_percent": "35%"},
            {"section": "Key Features", "description": "Bullet-point list: moral choices, crafting system, companion relationships, and end-game dungeons.", "avg_percent": "20%"}
        ],
        "key_phrases": ["forge your destiny", "choices shape the story", "recruit companions", "epic fantasy realm", "strategic combat"],
        "common_features": ["Character Customization", "Skill Choices", "Crafting", "Companions", "Moral Decisions"]
    },
    "strategy": {
        "blueprint": [
            {"section": "Command Hook", "description": "Establish the macro scale of leadership, empire building, or tactical defense.", "avg_percent": "20%"},
            {"section": "Resource Loop", "description": "Explain resource gathering, building construction, infrastructure development, or technology research trees.", "avg_percent": "30%"},
            {"section": "Tactical Confrontation", "description": "Detail unit types, battle configurations, weather effects, layout defensive layouts, and combat strategies.", "avg_percent": "30%"},
            {"section": "Key Features", "description": "Bullet-point list: single-player campaigns, skirmish maps, procedural maps, unit variations, and multiplayer matches.", "avg_percent": "20%"}
        ],
        "key_phrases": ["build your empire", "command your forces", "research technologies", "outsmart your enemies", "gather vital resources"],
        "common_features": ["Resource Management", "Technology Tree", "Base Building", "Unit Customization", "Skirmish Mode"]
    },
    "simulation": {
        "blueprint": [
            {"section": "Experience Hook", "description": "Introduce the specific job, life context, building scale, or physics simulator scenario.", "avg_percent": "25%"},
            {"section": "Day-to-Day Routine", "description": "Explain daily operational actions: farming, maintenance, custom building, driving, or management tasks.", "avg_percent": "35%"},
            {"section": "Progression & Customization", "description": "Detail upgrades, new equipment purchases, cosmetic layouts, expanding land/facilities, and unlocking tiers.", "avg_percent": "25%"},
            {"section": "Key Features", "description": "Bullet-point list: realistic physics, co-op support, sandbox mode, steam workshop custom items, and relax mode.", "avg_percent": "15%"}
        ],
        "key_phrases": ["manage your budget", "customize every detail", "realistic physics", "expand your facilities", "relaxing gameplay loop"],
        "common_features": ["Sandbox Mode", "Customization", "Progression System", "Cooperative Mode", "Realistic Physics"]
    },
    "puzzle": {
        "blueprint": [
            {"section": "Intellectual Hook", "description": "Explain the unique visual perspective, reality-bending rules, or primary cognitive challenge.", "avg_percent": "25%"},
            {"section": "Mechanic Progression", "description": "Explain how complexity escalates: introducing new tiles, gravity manipulation, perspective shifts, or logic gates.", "avg_percent": "35%"},
            {"section": "Atmosphere / Mood", "description": "Describe the relaxing visual aesthetics, ambient music, lack of timers/deadlines, or background mystery narrative.", "avg_percent": "20%"},
            {"section": "Key Features", "description": "Bullet-point list: level editor, relaxing soundtracks, accessibility settings, number of unique levels, and hint systems.", "avg_percent": "20%"}
        ],
        "key_phrases": ["bend your mind", "no rush or timers", "relaxing atmosphere", "hundreds of puzzles", "manipulate perspective"],
        "common_features": ["Level Progression", "Logic Puzzles", "Atmospheric Audio", "No Timers", "Minimalist Design"]
    },
    "adventure": {
        "blueprint": [
            {"section": "Mystery Hook", "description": "Introduce the exploration setting, missing person, forgotten ruins, or journey objective.", "avg_percent": "20%"},
            {"section": "World Exploration", "description": "Detail traversal mechanics, interacting with characters, examining clues, and environmental puzzles.", "avg_percent": "35%"},
            {"section": "Story Integration", "description": "Describe character dialogue choices, branching narrative paths, emotional growth, and player impact.", "avg_percent": "30%"},
            {"section": "Key Features", "description": "Bullet-point list: gorgeous hand-drawn art, fully voiced characters, atmospheric music, and interactive options.", "avg_percent": "15%"}
        ],
        "key_phrases": ["explore ancient ruins", "branching storylines", "unravel the mystery", "vibrant hand-drawn visuals", "interact with characters"],
        "common_features": ["Branching Dialog", "Exploration", "Scenic Views", "Interactive Clues", "Hand-drawn Visuals"]
    }
}

def extract_app_id(logo_url):
    if not logo_url:
        return None
    try:
        m = re.search(r'/apps/(\d+)/', logo_url)
        if m:
            return int(m.group(1))
    except Exception:
        pass
    return None

def get_dominant_colors(app_id, num_colors=3):
    url = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{app_id}/header.jpg"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        img = Image.open(BytesIO(r.content))
        
        # Downsample to speed up
        img = img.resize((100, 50))
        
        # Convert to palette mode (P) with adaptive palette
        quantized = img.convert('P', palette=Image.Palette.ADAPTIVE, colors=num_colors)
        palette = quantized.getpalette()
        colors = quantized.getcolors()
        colors = sorted(colors, key=lambda x: x[0], reverse=True)
        
        hex_colors = []
        for count, index in colors[:num_colors]:
            r = palette[index * 3]
            g = palette[index * 3 + 1]
            b = palette[index * 3 + 2]
            hex_colors.append(f"#{r:02x}{g:02x}{b:02x}")
        return hex_colors
    except Exception:
        # Return fallback palette based on genre if it fails
        return ["#0c0c1d", "#8b5cf6", "#f59e0b"]

def get_games_for_tag(tag_id, count=25):
    url = "https://store.steampowered.com/search/results/"
    params = {
        "json": 1,
        "start": 0,
        "count": count,
        "sort_by": "_FRSHCVR",  # relevance / top sellers
        "tags": tag_id,
    }
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        return r.json().get("items", [])
    except Exception as e:
        print(f"[ERROR] Failed to fetch tag search results: {e}")
        return []

def scrape_game_details(app_id):
    url = f"https://store.steampowered.com/app/{app_id}/"
    try:
        r = requests.get(url, headers=HEADERS, cookies=COOKIES, timeout=12)
        if r.status_code != 200:
            return None
            
        # Tags
        tags = []
        match = re.search(r'InitAppTagModal\(\s*\d+,\s*(\[[^\]]+\])', r.text)
        if match:
            try:
                tag_list = json.loads(match.group(1))
                tags = [t.get("name", "").strip() for t in tag_list if t.get("name")]
            except Exception:
                pass
                
        soup = BeautifulSoup(r.text, 'html.parser')
        if not tags:
            tags = [t.get_text().strip() for t in soup.find_all('a', class_='app_tag')]
            
        # Remove empty tags
        tags = [t for t in tags if t]

        # Short desc
        desc_div = soup.find('div', class_='game_description_snippet')
        short_desc = desc_div.get_text().strip() if desc_div else ""
        
        # Long desc
        long_div = soup.find('div', id='game_area_description')
        long_desc = ""
        if long_div:
            # Clean text but keep spacing
            long_desc = long_div.get_text().strip()
            # Collapse double lines
            long_desc = re.sub(r'\n+', '\n', long_desc)

        return {
            "tags": tags,
            "short_description": short_desc,
            "long_description": long_desc
        }
    except Exception as e:
        print(f"  [WARN] Scrape app details failed for {app_id}: {e}")
        return None

def analyze_blueprints_with_gemini(genre_name, descriptions):
    if not GEMINI_API_KEY:
        return None
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    prompt = f"""
Analyze these 5 top-performing Steam game store descriptions in the "{genre_name}" genre.
Extract their structural patterns and output a JSON representation containing the optimal description layout blueprint.

Competitor Descriptions:
{chr(10).join([f"Game {i+1}: {d}" for i, d in enumerate(descriptions)])}

Respond with raw, valid JSON only. Do not wrap in markdown code blocks. The JSON must match this structure exactly:
{{
  "blueprint": [
    {{"section": "Section Name", "description": "Specific structural guidelines on what to write here", "avg_percent": "percentage of page space"}}
  ],
  "key_phrases": ["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "common_features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"]
}}
"""
    try:
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        r = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=20)
        if r.status_code == 200:
            res_json = r.json()
            raw_text = res_json["contents"][0]["parts"][0]["text"].strip()
            # Clean JSON response if wrapped in code blocks
            if raw_text.startswith("```json"):
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1].split("```")[0].strip()
            return json.loads(raw_text)
    except Exception as e:
        print(f"  [WARN] Gemini blueprint analysis failed: {e}")
    return None

def main():
    os.makedirs("data/genres", exist_ok=True)
    
    global_tags = {}
    
    for key, info in GENRES.items():
        print(f"\n===== Scrapes starting for genre: {info['name']} (Tag: {info['tag_id']}) =====")
        items = get_games_for_tag(info["tag_id"], count=20)
        print(f"Found {len(items)} popular games in search index.")
        
        scraped_games = []
        descriptions_to_analyze = []
        tag_counts = {}
        
        for idx, item in enumerate(items):
            app_id = extract_app_id(item.get("logo", ""))
            name = item.get("name", "Unknown Game")
            if not app_id:
                continue
                
            print(f"[{idx+1}/{len(items)}] Processing {name} (AppID: {app_id})...")
            
            # Dominant Colors
            colors = get_dominant_colors(app_id)
            
            # Scrape tags and descriptions
            details = scrape_game_details(app_id)
            if not details:
                time.sleep(1)
                continue
                
            tags = details["tags"]
            for t in tags:
                tag_counts[t] = tag_counts.get(t, 0) + 1
                global_tags[t] = global_tags.get(t, 0) + 1
                
            game_record = {
                "app_id": app_id,
                "name": name,
                "capsule_url": f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{app_id}/header.jpg",
                "dominant_colors": colors,
                "tags": tags
            }
            scraped_games.append(game_record)
            
            # Keep descriptions for top 5 games to feed Gemini blueprint generator
            if len(descriptions_to_analyze) < 5 and details["long_description"]:
                descriptions_to_analyze.append(details["long_description"][:1000]) # Limit length
                
            time.sleep(1.5) # Polite crawl gap
            
        # Top Tags mapping
        sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
        top_tags = []
        total_records = len(scraped_games)
        for tag, count in sorted_tags[:15]:
            top_tags.append({
                "tag": tag,
                "count": count,
                "percentage": round((count / total_records) * 100) if total_records else 0
            })
            
        # Blueprint logic (Gemini analysis or fallback)
        blueprint_data = analyze_blueprints_with_gemini(info["name"], descriptions_to_analyze)
        if not blueprint_data:
            print("  Using static fallback blueprint data...")
            blueprint_data = FALLBACK_BLUEPRINTS[key]
            
        genre_payload = {
            "genre_id": key,
            "genre_name": info["name"],
            "games": scraped_games,
            "blueprint": blueprint_data["blueprint"],
            "key_phrases": blueprint_data["key_phrases"],
            "common_features": blueprint_data["common_features"],
            "top_tags": top_tags
        }
        
        # Write file
        out_path = f"data/genres/{key}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(genre_payload, f, indent=2)
        print(f"Successfully saved scraped data: {os.path.abspath(out_path)}")
        
    # Global tags data output
    sorted_global = sorted(global_tags.items(), key=lambda x: x[1], reverse=True)
    out_global = [{"tag": t, "count": c} for t, c in sorted_global[:100]]
    with open("data/global_tags.json", "w", encoding="utf-8") as f:
        json.dump(out_global, f, indent=2)
    print("\n===== Finished playbuild scraping program! =====")

if __name__ == "__main__":
    main()
