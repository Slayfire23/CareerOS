# Set H: engine against human decisions (rules-v9, 9eac678)

Set H is development data. These figures don't show how the engine performs on new cases.

**Exact agreement: 26 of 26 (100.0%)**

| Case | Requirement | Human | Engine | Agree | AI rater 1 accepted | AI rater 2 accepted |
|---|---|---|---|---|---|---|
| H-01 | SWIFT payment messaging | Not enough information | Not enough information | Yes | Not supported, Not enough information, Possible | Not supported, Not enough information |
| H-02 | Bachelor of Laws | Not supported | Not supported | Yes | Not supported | Not supported |
| H-03 | Adobe Photoshop | Not supported | Not supported | Yes | Not supported, Not enough information | Not supported, Not enough information |
| H-04 | AutoCAD | Supported | Supported | Yes | Possible, Supported | Possible |
| H-05 | 3 years of accounting | Possible | Possible | Yes | Possible, Not supported | Possible, Supported |
| H-06 | Respond to prompts from the dispatch system within 60 seconds | Not enough information | Not enough information | Yes | Possible, Not enough information | Possible, Supported |
| H-07 | SWIFT payment messaging | Supported | Supported | Yes | Possible | Possible, Supported |
| H-08 | Master's degree in Mechanical Engineering | Supported | Supported | Yes | Possible, Supported | Possible |
| H-09 | Bachelor's in Accounting | Possible | Possible | Yes | Possible, Supported | Possible |
| H-10 | Master's degree in Architecture | Supported | Supported | Yes | Possible, Supported | Possible |
| H-11 | MD or equivalent medical degree | Supported | Supported | Yes | Possible, Supported | Possible |
| H-12 | Patient scheduling | Supported | Supported | Yes | Possible | Possible, Supported |
| H-13 | Contract review | Supported | Supported | Yes | Possible | Possible, Supported |
| H-14 | Strong leadership | Possible | Possible | Yes | Possible | Possible, Supported |
| H-15 | TIG welding | Supported | Supported | Yes | Supported | Supported |
| H-16 | Accounts payable | Supported | Supported | Yes | Supported | Supported |
| H-17 | Programmable logic controllers | Supported | Supported | Yes | Supported | Supported |
| H-18 | 3 years in logistics | Possible | Possible | Yes | Possible, Supported | Possible, Supported |
| H-19 | 5+ years in a professional kitchen | Supported | Supported | Yes | Supported, Possible | Supported |
| H-20 | CompTIA Security+ | Supported | Supported | Yes | Supported | Possible, Supported |
| H-21 | CPR certification | Supported | Supported | Yes | Supported | Supported, Possible |
| H-22 | Administer medication according to physician instructions | Possible | Possible | Yes | Possible, Supported | Supported, Possible |
| H-23 | Go programming language | Supported | Supported | Yes | Possible | Possible |
| H-24 | Supported Windows and Active Directory users for at least 2 years | Supported | Supported | Yes | Supported, Possible | Supported |
| H-25 | Prior experience acting as the system administrator for Linux servers | Supported | Supported | Yes | Supported, Possible | Supported |
| H-26 | gRPC | Supported | Supported | Yes | Possible | Possible |

## Confusion matrix (rows: human; columns: engine)

| Human \ Engine | Supported | Possible | Not supported | Not enough information |
|---|---|---|---|---|
| Supported | 17 | 0 | 0 | 0 |
| Possible | 0 | 5 | 0 | 0 |
| Not supported | 0 | 0 | 2 | 0 |
| Not enough information | 0 | 0 | 0 | 2 |

## Groups

- **False supported:** none
- **Human Supported, engine lower:** none
- **Human Not supported, engine uncertain:** none
- **Human verdict outside AI rater 1:** H-07, H-12, H-13, H-23, H-26
- **Human verdict outside AI rater 2:** H-04, H-06, H-08, H-10, H-11, H-23, H-26
- **Engine verdict outside AI rater 1:** H-07, H-12, H-13, H-23, H-26
- **Engine verdict outside AI rater 2:** H-04, H-06, H-08, H-10, H-11, H-23, H-26
