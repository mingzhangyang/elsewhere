# Sky moment test: script and observation notes

Status: ready for sessions, November 15, 2026. This is the guide for the user test in [ROADMAP phase 3](../ROADMAP.md#3-prototype-and-test-a-sky-moment-s). The project owner runs the sessions and makes the decision at the end: build sky moments (phase 4) next if the response is strong, or the planner (phase 6) if it is weak.

The same sessions can cover the unfamiliar-user gate in [RELEASE.md](RELEASE.md) (part B below). Record that part separately so each result stands on its own.

## What the prototype offers

- **Share dialog → Make an image.** A keepsake image of the moment on screen, in the language the app is showing: the sky, the place name, local date and time, what the view is turned to, the Moon's phase, that moment's conditions, where the conditions come from ("Clouds based on reanalysis for this area"), and the weather and star-catalog credits. Device locations are printed as "My location", never as coordinates.
- **Variants**, chosen with the two rows of buttons above the image:
  - Style: **Realistic** (captured from the live sky) or **Illustrated** (a simple cartoon drawing of the same calculated sky; objects stay in their places, the Moon and planets are drawn larger, and the image says "Illustration").
  - Horizon: **Ridge** (the app's horizon today) or one of three scenery silhouettes planned for phase 5: **Mountains**, **Sea**, **City**. All are under 2° of altitude and labelled illustrative on the image.
  - The horizon only shows when the view includes it. To compare horizons, look low (a rising Moon, an evening Venus, a sunset).
- **The link.** When the view is centered on the Moon, the Sun, a planet or a star, or turned to a line pattern with lines shown, the link opens with the view turning to it ("When opened, the view turns to Jupiter."). Device coordinates are rounded to about 10 km unless the sender ticks **Share my exact location**.
- **Save image** downloads a PNG; **Send image** appears where the browser can share files (most phones), and sends the image with the link.

What it does not do yet (phase 4): chat-app link previews, a one-sentence welcome when a link opens, high-resolution export, or a polished illustration style.

## Before the sessions

- Use the live site (`https://elsewhere.orangely.xyz`) on the participant's own phone if they agree, otherwise a test phone. Note the build identifier from the deployment.
- Have two or three ready-made moments as links in case a participant cannot think of one, for example: the Moon over a city where a relative lives, tonight; a sky from a well-known date in the participant's country; an evening Venus or a bright planet. Make each from the app (center the object, then share) so they turn to their subject.
- Decide the variant order in advance and alternate it between participants, so the first image seen is not always the same style:

| Participant | First style shown | Second style | Horizon pair shown    |
| ----------- | ----------------- | ------------ | --------------------- |
| P1          | Realistic         | Illustrated  | Ridge, then Mountains |
| P2          | Illustrated       | Realistic    | Sea, then Ridge       |
| P3          | Realistic         | Illustrated  | City, then Ridge      |
| P4          | Illustrated       | Realistic    | Ridge, then Sea       |
| P5          | Realistic         | Illustrated  | Mountains, then Ridge |
| P6          | Illustrated       | Realistic    | Ridge, then City      |

- Privacy: the participant's moments may be personal (a birthday, a parent's city). Record the kind of moment and the city, not the date, the person or the link. Do not keep their images unless they offer them.

## Session (about 30 minutes)

Do not coach. If someone is stuck for more than a minute, note it, then give the smallest hint that lets them continue.

### Part A: sky moments (about 20 minutes)

1. **Warm-up (2 min).** "This app shows the sky of a particular moment, anywhere, as it really was, with that moment's weather." Nothing more about sharing.
2. **Their own moment (8 min).** "Is there a moment, a place and time, whose sky you would like to see? It can be tonight somewhere else, or a date that matters to you." Let them find it (place, date and time, perhaps the Moon). Then: "If you wanted to keep or send this, what would you do?" Note whether they find **Share** and **Make an image** unaided.
3. **The image (5 min).** With the image open, show the first style, then the second (from the table). Ask:
   - "Would you send one of these to someone? Which one?" Note which, and the words they use.
   - "Who would you send it to?" (A person, a group chat, social media, nobody.)
   - "Is anything on it confusing, or missing?" Watch whether they read the provenance and credit lines, and whether "Illustration" is noticed.
   - Show the horizon pair from the table. "Does either change how you feel about it?"
4. **Receiving (5 min).** Open one of the ready-made links on their phone as if it had arrived in a chat. Note whether they see the view turn to its subject and whether they understand what they are looking at without help. Time from tapping the link to saying what the subject is.
5. **The real test.** "If you like, send it to someone now, the image, the link, or both." Note whether they do, through which app, and whether they send the image, the link, or both. Do not push; declining is a result.

### Part B: unfamiliar-user gate (RELEASE.md, about 10 minutes)

Ask them to find tonight's Moon in another city, explain why it is or is not visible, change the weather and set it back, save a place, and share a view. Record completion, confusion and recovery without coaching, as RELEASE.md asks.

## Observation sheet

Copy one per participant.

```text
Participant:            Date:            Build:            Device / browser:
Language:   English / Chinese            Variant order (from the table):

PART A
Moment chosen (kind + city only):
Found Share unaided?        yes / with hint / no      Notes:
Found Make an image?        yes / with hint / no      Notes:
Preferred style:            Realistic / Illustrated / neither      Their words:
Horizon reaction:           Ridge / scenery preferred / no difference      Their words:
Would send to:              person (who, in general terms) / group / social / nobody
Read provenance / credits?  yes / glanced / no
Noticed "Illustration"?     yes / no / n.a.
Confusing or missing:
Received link: saw the turn?        yes / no      Understood subject unaided? yes / no
Time from tap to naming the subject:          s
Actually sent it?           yes / no      Image / link / both      App:
Strength of interest (observer):   strong / some / weak      Why:

PART B (RELEASE.md scenarios)
Moon in another city:       done / with hint / not done
Why (not) visible:          done / with hint / not done
Weather changed and reset:  done / with hint / not done
Place saved:                done / with hint / not done
View shared:                done / with hint / not done
Confusions and recoveries:
```

## Summary for the decision

After the sessions, fill in one table and keep it with the dated entry in [VALIDATION.md](VALIDATION.md):

| Question                                   | Count (of N) | Notes |
| ------------------------------------------ | ------------ | ----- |
| Wanted to send the moment                  |              |       |
| Actually sent it during the session        |              |       |
| Preferred the illustrated style            |              |       |
| Preferred a scenery horizon over the ridge |              |       |
| Understood a received link without help    |              |       |
| Found Share and Make an image unaided      |              |       |

A suggested reading, for the owner to accept or change: a strong response is most participants wanting to send it to a named person, and at least two actually sending it; a weak response is most saying they would not send it, or would only keep it. Mixed results, or a clear preference for one style, are worth recording as such; they shape phase 4 even if it goes ahead.
