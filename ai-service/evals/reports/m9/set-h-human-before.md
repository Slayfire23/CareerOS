# Set H: engine against human decisions (rules-v8, feca330)

Set H is development data. These figures don't show how the engine performs on new cases.

**Exact agreement: 12 of 26 (46.2%)**

| Case | Requirement | Human | Engine | Agree | AI rater 1 accepted | AI rater 2 accepted |
|---|---|---|---|---|---|---|
| H-01 | SWIFT payment messaging | Not enough information | Not enough information | Yes | Not supported, Not enough information, Possible | Not supported, Not enough information |
| H-02 | Bachelor of Laws | Not supported | Not supported | Yes | Not supported | Not supported |
| H-03 | Adobe Photoshop | Not supported | Not enough information | **No** | Not supported, Not enough information | Not supported, Not enough information |
| H-04 | AutoCAD | Supported | Possible | **No** | Possible, Supported | Possible |
| H-05 | 3 years of accounting | Possible | Possible | Yes | Possible, Not supported | Possible, Supported |
| H-06 | Respond to prompts from the dispatch system within 60 seconds | Not enough information | Not enough information | Yes | Possible, Not enough information | Possible, Supported |
| H-07 | SWIFT payment messaging | Supported | Possible | **No** | Possible | Possible, Supported |
| H-08 | Master's degree in Mechanical Engineering | Supported | Possible | **No** | Possible, Supported | Possible |
| H-09 | Bachelor's in Accounting | Possible | Possible | Yes | Possible, Supported | Possible |
| H-10 | Master's degree in Architecture | Supported | Possible | **No** | Possible, Supported | Possible |
| H-11 | MD or equivalent medical degree | Supported | Possible | **No** | Possible, Supported | Possible |
| H-12 | Patient scheduling | Supported | Not enough information | **No** | Possible | Possible, Supported |
| H-13 | Contract review | Supported | Possible | **No** | Possible | Possible, Supported |
| H-14 | Strong leadership | Possible | Not enough information | **No** | Possible | Possible, Supported |
| H-15 | TIG welding | Supported | Supported | Yes | Supported | Supported |
| H-16 | Accounts payable | Supported | Supported | Yes | Supported | Supported |
| H-17 | Programmable logic controllers | Supported | Supported | Yes | Supported | Supported |
| H-18 | 3 years in logistics | Possible | Possible | Yes | Possible, Supported | Possible, Supported |
| H-19 | 5+ years in a professional kitchen | Supported | Possible | **No** | Supported, Possible | Supported |
| H-20 | CompTIA Security+ | Supported | Supported | Yes | Supported | Possible, Supported |
| H-21 | CPR certification | Supported | Supported | Yes | Supported | Supported, Possible |
| H-22 | Administer medication according to physician instructions | Possible | Possible | Yes | Possible, Supported | Supported, Possible |
| H-23 | Go programming language | Supported | Possible | **No** | Possible | Possible |
| H-24 | Supported Windows and Active Directory users for at least 2 years | Supported | Not enough information | **No** | Supported, Possible | Supported |
| H-25 | Prior experience acting as the system administrator for Linux servers | Supported | Not enough information | **No** | Supported, Possible | Supported |
| H-26 | gRPC | Supported | Not enough information | **No** | Possible | Possible |

## Confusion matrix (rows: human; columns: engine)

| Human \ Engine | Supported | Possible | Not supported | Not enough information |
|---|---|---|---|---|
| Supported | 5 | 8 | 0 | 4 |
| Possible | 0 | 4 | 0 | 1 |
| Not supported | 0 | 0 | 1 | 1 |
| Not enough information | 0 | 0 | 0 | 2 |

## Groups

- **False supported:** none
- **Human Supported, engine lower:** H-04, H-07, H-08, H-10, H-11, H-12, H-13, H-19, H-23, H-24, H-25, H-26
- **Human Not supported, engine uncertain:** H-03
- **Human verdict outside AI rater 1:** H-07, H-12, H-13, H-23, H-26
- **Human verdict outside AI rater 2:** H-04, H-06, H-08, H-10, H-11, H-23, H-26
- **Engine verdict outside AI rater 1:** H-12, H-14, H-24, H-25, H-26
- **Engine verdict outside AI rater 2:** H-06, H-12, H-14, H-19, H-24, H-25, H-26
