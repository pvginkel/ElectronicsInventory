# Field Normalization Rules

These rules are **mandatory**, not suggestions. Output that does not follow them is
wrong even if the facts are correct. When in doubt, prefer *null* over a guess, and
prefer matching how equivalent parts already in the inventory are represented.

## product_name (Description)

**The description is a dense technical spec line — NOT a sentence, NOT marketing.**
Its only job is to let a human select the right part at a glance from the specs that
actually distinguish it. Everything that is *not* selection-relevant, and everything
that already lives in a structured field, stays out of the prose where it is noise —
but the headline specs **must** appear here even though they are also in fields.

**Lead with the identity:** the value (for passives) or the MPN/family (for anything
with a part number). Use the symbols `Ω µ × ° ²`, never `ohm`, `uF`, `x`. Use `SMD`
and `TH` for mounting. One line, no trailing period.

**Per-category templates (follow exactly):**

| Category | Template | Example |
|---|---|---|
| Resistor | `{value}Ω {package} {SMD\|TH} [{tol}] [{power}] [{special}] resistor` | `68Ω 0805 SMD resistor` · `10kΩ axial TH 1% 0.25W resistor` · `1mΩ 3920 SMD 5W 1% current-sense resistor` |
| Capacitor | `{value} [{voltage}] [{dielectric}] {package} {SMD\|TH} [{type}] capacitor` | `2.2µF 25V X7R 0805 SMD capacitor` · `470µF 16V electrolytic capacitor, radial TH` · `0.1µF 275VAC X2 film capacitor, TH` |
| Diode / rectifier / TVS | `{MPN} {function} diode, [{I}] {V}, {package}` | `1N4007 rectifier diode, 1000V, DO-41` |
| Transistor (BJT/MOSFET) | `{MPN} {channel/type} {transistor\|MOSFET}, {V} [{I}], {package}` | `STP16NF06 N-channel MOSFET, 60V 16A, TO-220` |
| IC (logic/op-amp/regulator/driver/interface) | `{MPN\|family} {function}, [{key specs}], {package}` | `LM358 dual op-amp, DIP-8 TH` · `TLV70033 LDO regulator, 3.3V 200mA, SOT-23-5` |
| Converter / power module | `{MPN} {topology} {module\|converter}, {Vin}→{Vout} [{I\|W}], [{package}]` | `HLK-PM24 AC-DC module, 24V 3W` · `MP1584EN buck converter, 4.5-28V→0.8-25V 3A, SOIC-8` |
| Sensor / MPN module | `{MPN\|family} {function}[, {interface}][, {package}]` | `MPR121 capacitive-touch controller, 12-ch I2C, QFN` |
| Dev board / branded module | `{brand} {product name} [({MCU/chip})]` | `Waveshare ESP32-C6-Zero, WiFi6/BLE/802.15.4` |
| Connector / header / cable | `{system} {positions} {gender/style}, {pitch}, {TH\|SMD}[, {length}]` | `JST PH 5-pin female cable, 2.0mm, 150mm` |
| Generic / unbranded physical part | `{defining attributes} {noun}` | `WW COB LED panel, 120×36mm, 10W 12V` · `White button cap, 12×12mm tactile switch` |

**Allowed in the description** (when they distinguish the part): value, voltage,
tolerance, power, package, mounting, interface (`I2C`/`SPI`/`UART`), topology, MPN,
and — only for parts whose size *is* the identity (panels, enclosures, button caps,
bare tactile buttons, cables) — the dimension/length.

**Banned from the description:** marketing ("for Arduino", "high quality", "premium"),
seller/marketplace names, datasheet-level dumps, restating the MPN more than once, and
any attribute that is not used to select the part.

## manufacturer
- The **actual component/brand manufacturer**, in canonical short form: drop legal
  suffixes (`Co., Ltd.`, `Inc.`, `GmbH`), heritage/parenthetical notes, and division
  names — use the parent (`Vishay`, not `Vishay Dale`/`Vishay Vitramon`; `Broadcom`,
  not `Avago / Broadcom …`; `Murata`, not `Murata Manufacturing Co., Ltd.`).
- Use **exactly `Generic`** when the manufacturer is unknown or the part is unbranded.
  **NEVER leave it blank/null** — unknown means `Generic`.
- **NEVER** a seller/marketplace (`TinyTronics`, `Ben's Electronics`, AliExpress).
  Note: `DFRobot`, `SparkFun`, `Waveshare`, `Arduino`, `WeMos` *are* the manufacturers
  of their own boards and are correct there.

## manufacturer_part_number
- The MPN or canonical part-family root (e.g. `SSD1306`, `AMS1117-3.3`, `IRLZ44N`).
- `null` for generic parts without a real MPN.

## product_family (series)
- **Only** the manufacturer's family/series token: `VJ`, `HLK-PM`, `1N400x`,
  `ESP32-S3`, `GL55`.
- **NEVER**: the full restated MPN, a package/size (`0805`), marketing
  (`10W Ultra-small Series`, `Commercial Grade MLCC`), or a description
  (`0805 thick-film chip resistor`, `OpenTherm Shield`).
- `null` when there is no real family.

## product_category
- Exactly one from the supplied list. If none fits: `Proposed: <name>`.
- **Be consistent with the inventory**: equivalent parts must share a category
  (every JST PH cable → the same category; an LED strip → `LED Strip`, not
  `LED (Discrete)`).

## package_type
- **Only a real footprint/package code**: `0805`, `1206`, `SOT-23-5`, `SOIC-8`,
  `TO-92`, `TO-220`, `DO-41`, `DO-201`, `DIP-8`, `TSSOP-16`, `QFN`, `SIP-4`, `LGA-9`,
  `microSD`. `Axial`/`Radial` are acceptable for leaded passives.
- **`null`** when the part has no standard package: modules, dev boards, assembled
  breakouts, cables, enclosures, LED panels/strips.
- **NEVER**: `Module`, `Through-Hole`, `Through Hole`, `Enclosure`, `SMD`, `PCB`,
  `PCBA`, `Plugin`, `PTH`. Mounting belongs in `mounting_type`, not here.

## mounting_type
Exactly one of: `Through-Hole`, `Surface-Mount`, `Panel Mount`, `DIN Rail Mount`.

## voltage_rating / input_voltage / output_voltage
- Format: uppercase `V`, no space; en-dash ranges; `AC`/`DC` suffix when relevant:
  `3.3V`, `2–24V`, `100–240V AC`.
- **`voltage_rating`**: the part's max rated/working voltage. Use for passives
  (capacitors, resistors), diodes, varistors, relay contact ratings, switches.
  A single value.
- **`input_voltage` / `output_voltage`**: **only** for power-conversion / supply /
  regulator / dev-board parts (converter Vin/Vout, module supply rail).
- **NEVER** put a capacitor's rated voltage in `input_voltage`; **NEVER** put a
  converter's I/O voltage in `voltage_rating`.

## physical_dimensions
- Format: `L × W × H mm` (or `Ø × L mm` for cylindrical) — real `×`, spaces around it,
  **no** `≈`, `~`, or "approximately".
- Use only when size distinguishes the part (panels, enclosures, button caps, bare
  tactile buttons); omit when redundant.
- **NEVER** put cable/wire length here — length goes in the description.

## tags
**Purpose**: searchable attributes that **no structured column already holds**.
0–8 tags, lowercase-with-hyphens.

**Allowed** (examples): function/behavior (`latching`, `bidirectional`, `zero-cross`,
`current-sense`), interface (`i2c`, `spi`, `uart`, `gpio`, `modbus`), capability /
lifecycle (`obsolete`, `waterproof`, `ip67`), chip/family search aids (`esp32-s3`,
`rp2040`, `atmega4809`), dielectric (`x7r`, `x5r`, `x2`), distinctive construction
(`cob-strip`, `photomos`).

**HARD BANS — never a tag** (each duplicates another column or is noise):
- the type noun (`resistor`, `capacitor`, `diode`, `relay`, `module`, `sensor`, …)
- package codes (`0805`, `dip-8`, `to-220`, …)
- mounting (`smd`, `tht`, `through-hole`, `surface-mount`, `panel-mount`)
- the manufacturer name
- any quantitative value (resistance, capacitance, `5v`/`12v`, current, power,
  dimensions, lengths, pin counts, color temps like `3000k`)
- data-quality / sourcing notes (`variant-dependent-*`, `*-sku`, seller names)
- near-duplicates of another tag (`i2c`, not also `i2c-interface`)

## Consistency with the existing inventory (REQUIRED)
You are given the rest of the inventory for a reason. Your record **must** look like it
belongs next to the equivalent parts already there — same category name, same
manufacturer spelling, same description template, same tag vocabulary, same
package/voltage/dimension formatting. Before finalizing, compare against the 3–5 most
similar existing parts and conform to their conventions. **If your output would be the
lone formatting outlier, your output is wrong — fix it, not them.**

# Noise Elimination
Always remove: marketing language, seller names, product/SKU codes, information repeated
across fields, unnecessary precision, and filler ("for Arduino", "high quality").

# Validation / bail-out
- **Never guess.** Unknown field → `null` (the sole exception: manufacturer → `Generic`).
- Tags: ≤8, lowercase-hyphen, no banned categories above.
- If you cannot confidently identify or normalize the part, set
  `analysis_failure_reason` and stop rather than emit low-quality data.

# Complete Examples

**Input**: "100nf 0805 cap"
```json
{
  "product_name": "0.1µF 50V X7R 0805 SMD capacitor",
  "product_family": "VJ",
  "product_category": "Capacitor",
  "manufacturer": "Generic",
  "package_type": "0805",
  "mounting_type": "Surface-Mount",
  "voltage_rating": "50V",
  "tags": ["x7r", "decoupling"]
}
```

**Input**: "IRLZ44N MOSFET Power Transistor"
```json
{
  "product_name": "IRLZ44N N-channel MOSFET, 55V 47A, TO-220",
  "product_family": "IRLZ44",
  "product_category": "MOSFET",
  "manufacturer": "Infineon",
  "manufacturer_part_number": "IRLZ44N",
  "package_type": "TO-220",
  "mounting_type": "Through-Hole",
  "part_pin_count": 3,
  "voltage_rating": "55V",
  "tags": ["n-channel", "logic-level"]
}
```

**Input**: "HLK-PM24"
```json
{
  "product_name": "HLK-PM24 AC-DC module, 24V 3W",
  "product_family": "HLK-PM",
  "product_category": "AC-DC Power Module",
  "manufacturer": "Hi-Link",
  "manufacturer_part_number": "HLK-PM24",
  "package_type": null,
  "mounting_type": "Through-Hole",
  "part_pin_count": 4,
  "part_pin_pitch": "5.08 mm",
  "input_voltage": "100–240V AC",
  "output_voltage": "24V DC",
  "physical_dimensions": "34 × 20 × 15 mm",
  "tags": ["isolated", "mains-powered"]
}
```

**Input**: "Ben's Electronics SKU KO70" (a 0.96" SSD1306 OLED)
```json
{
  "product_name": "0.96\" 128×64 I2C OLED (SSD1306), yellow/blue",
  "product_family": "SSD1306",
  "product_category": "Display - OLED",
  "manufacturer": "Generic",
  "package_type": null,
  "mounting_type": "Through-Hole",
  "part_pin_count": 4,
  "input_voltage": "3.3–5V",
  "tags": ["i2c", "ssd1306"]
}
```

**Input**: "Sharp PC817"
```json
{
  "product_name": "PC817 optocoupler, DIP-4",
  "product_family": "PC817",
  "product_category": "Optocoupler",
  "manufacturer": "Sharp",
  "manufacturer_part_number": "PC817",
  "package_type": "DIP-4",
  "mounting_type": "Through-Hole",
  "part_pin_count": 4,
  "part_pin_pitch": "2.54 mm",
  "tags": ["phototransistor", "isolation"]
}
```
