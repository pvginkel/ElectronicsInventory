from complex_model import AttributeKeyDefinition, AttributeRegistry


STARTER_ATTRIBUTE_REGISTRY = AttributeRegistry(keys=[
    # -------- Package / Mechanical --------
    AttributeKeyDefinition(
        key="pkg.package",
        label="Package",
        hint="Mechanical case/size code, exactly as the industry names it.",
        value_type="string",
        samples=["0603", "SOT-223", "QFN-56", "TO-220"],
        synonyms=["case", "housing", "form factor"],
        namespace="pkg"
    ),
    AttributeKeyDefinition(
        key="pkg.footprint",
        label="Footprint",
        hint="ECAD footprint name (KiCad/Eagle/Altium) if known.",
        value_type="string",
        samples=["R_0603_1608Metric", "SOIC-8_3.9x4.9mm_P1.27mm"],
        namespace="pkg"
    ),
    AttributeKeyDefinition(
        key="pkg.pin_count",
        label="Pin/Position Count",
        hint="Total number of electrical pins or positions.",
        value_type="number",
        unit="count",
        samples=[2, 3, 8, 56],
        namespace="pkg"
    ),
    AttributeKeyDefinition(
        key="pkg.pitch_mm",
        label="Pitch (mm)",
        hint="Center-to-center distance for pins/contacts. Use millimeters.",
        value_type="number",
        unit="mm",
        samples=[2.54, 1.27, 0.5],
        namespace="pkg"
    ),
    AttributeKeyDefinition(
        key="mech.mounting",
        label="Mounting",
        hint="How it mounts: through-hole, surface-mount, panel, DIN-rail.",
        value_type="string",
        allowed_values=["THT", "SMD", "Panel", "DIN-rail", "PCB Mount"],
        samples=["SMD"],
        synonyms=["mounting type"],
        namespace="mech"
    ),
    AttributeKeyDefinition(
        key="mech.orientation",
        label="Orientation",
        hint="Connector/part orientation relative to PCB (e.g., right-angle).",
        value_type="string",
        allowed_values=["Vertical", "Right-angle"],
        samples=["Right-angle"],
        namespace="mech"
    ),
    AttributeKeyDefinition(
        key="mech.size_mm",
        label="Overall Size (mm)",
        hint="Overall L×W×H as free text; include mm, e.g., '7×7×0.9 mm'.",
        value_type="string",
        samples=["7×7×0.9 mm", "20×15×10 mm"],
        namespace="mech"
    ),
    AttributeKeyDefinition(
        key="mech.esd_sensitive?",
        label="ESD Sensitive",
        hint="True if part requires ESD precautions (ICs, MOSFETs).",
        value_type="boolean",
        samples=[True],
        namespace="mech"
    ),
    AttributeKeyDefinition(
        key="mech.msl",
        label="Moisture Sensitivity Level",
        hint="JEDEC MSL as text (e.g., 'MSL3').",
        value_type="string",
        samples=["MSL3"],
        namespace="mech"
    ),

    # -------- Electrical (generic) --------
    AttributeKeyDefinition(
        key="elec.v_max_v",
        label="Max Voltage (V)",
        hint="Absolute maximum voltage rating. Use volts (V).",
        value_type="number",
        unit="V",
        samples=[3.6, 30, 60],
        synonyms=["maximum voltage", "Vmax"],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.i_max_a",
        label="Max Current (A)",
        hint="Absolute maximum continuous current. Use amperes (A).",
        value_type="number",
        unit="A",
        samples=[0.02, 2, 60],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.power_w",
        label="Power Rating (W)",
        hint="Rated power dissipation. Use watts (W).",
        value_type="number",
        unit="W",
        samples=[0.063, 0.25, 1.0],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.tolerance_pct",
        label="Tolerance (%)",
        hint="Percentage tolerance (e.g., 1, 5). Do not include the % symbol.",
        value_type="number",
        unit="%",
        samples=[1, 5, 10],
        namespace="elec"
    ),

    # -------- Passives (value keys; pick the one that applies) --------
    AttributeKeyDefinition(
        key="elec.value_ohm",
        label="Resistance (Ω)",
        hint="Nominal resistance in ohms. Normalize to numeric ohms; tags may keep '10 kΩ'.",
        value_type="number",
        unit="Ω",
        samples=[10000, 220, 1000000],
        synonyms=["resistance", "value (resistor)"],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.value_f",
        label="Capacitance (F)",
        hint="Capacitance in farads. Use numeric F; e.g., 1e-6 for 1 µF.",
        value_type="number",
        unit="F",
        samples=[1e-6, 1e-9, 100e-6],
        synonyms=["capacitance", "value (capacitor)"],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.value_h",
        label="Inductance (H)",
        hint="Inductance in henries. Use numeric H; e.g., 10e-6 for 10 µH.",
        value_type="number",
        unit="H",
        samples=[10e-6, 100e-6],
        synonyms=["inductance", "value (inductor)"],
        namespace="elec"
    ),

    # -------- Discretes / Power --------
    AttributeKeyDefinition(
        key="elec.vds_v",
        label="Vds (V)",
        hint="MOSFET drain-source voltage rating in volts.",
        value_type="number",
        unit="V",
        samples=[30, 55, 100],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.id_a",
        label="Id (A)",
        hint="MOSFET continuous drain current at 25°C in amperes.",
        value_type="number",
        unit="A",
        samples=[10, 47, 100],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.rds_on_mohm",
        label="Rds(on) (mΩ)",
        hint="MOSFET on-resistance at specified gate voltage, in milliohms.",
        value_type="number",
        unit="mΩ",
        samples=[22, 5, 90],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.logic_level?",
        label="Logic-Level Gate",
        hint="True if the MOSFET fully enhances at 4–5 V or lower gate drive.",
        value_type="boolean",
        samples=[True],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.forward_v_v",
        label="Forward Voltage (Vf)",
        hint="Typical forward voltage drop for diodes/LEDs in volts.",
        value_type="number",
        unit="V",
        samples=[0.2, 0.7, 2.0],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.if_a",
        label="Forward Current (If, A)",
        hint="Continuous forward current in amperes.",
        value_type="number",
        unit="A",
        samples=[0.02, 0.35, 1.0],
        namespace="elec"
    ),

    # -------- Power conversion --------
    AttributeKeyDefinition(
        key="power.v_in_min_v",
        label="Vin Min (V)",
        hint="Minimum input voltage for regulators/converters.",
        value_type="number",
        unit="V",
        samples=[3.0, 4.5],
        namespace="power"
    ),
    AttributeKeyDefinition(
        key="power.v_in_max_v",
        label="Vin Max (V)",
        hint="Maximum input voltage for regulators/converters.",
        value_type="number",
        unit="V",
        samples=[12, 24, 60],
        namespace="power"
    ),
    AttributeKeyDefinition(
        key="power.v_out_v",
        label="Vout (V)",
        hint="Nominal output voltage. Use volts (V). For multiple rails, use list.",
        value_type="number_list",
        unit="V",
        samples=[[3.3], [5.0], [5.0, 12.0]],
        namespace="power"
    ),
    AttributeKeyDefinition(
        key="power.i_out_max_a",
        label="Iout Max (A)",
        hint="Maximum continuous output current per rail.",
        value_type="number",
        unit="A",
        samples=[1.0, 2.5, 10.0],
        namespace="power"
    ),
    AttributeKeyDefinition(
        key="power.efficiency_pct",
        label="Efficiency (%)",
        hint="Typical peak efficiency percentage (numeric, 0–100).",
        value_type="number",
        unit="%",
        samples=[85, 92, 96],
        namespace="power"
    ),

    # -------- Interfaces / MCUs --------
    AttributeKeyDefinition(
        key="iface.buses_list",
        label="Interfaces",
        hint="Hardware buses supported. Choose from common names.",
        value_type="string_list",
        allowed_values=["I2C", "SPI", "UART", "USB", "CAN", "LIN", "1-Wire", "Ethernet"],
        samples=[["I2C", "SPI"]],
        synonyms=["interfaces", "protocols"],
        namespace="iface"
    ),
    AttributeKeyDefinition(
        key="iface.usb_role",
        label="USB Role",
        hint="USB role supported by the device.",
        value_type="string",
        allowed_values=["Device", "Host", "OTG"],
        samples=["OTG"],
        namespace="iface"
    ),
    AttributeKeyDefinition(
        key="iface.gpio_count",
        label="GPIO Count",
        hint="Approximate number of general-purpose I/O pins.",
        value_type="number",
        unit="count",
        samples=[14, 30, 45],
        namespace="iface"
    ),
    AttributeKeyDefinition(
        key="iface.clock_mhz",
        label="Core Clock (MHz)",
        hint="Nominal MCU core clock in MHz.",
        value_type="number",
        unit="MHz",
        samples=[16, 48, 240],
        namespace="iface"
    ),
    AttributeKeyDefinition(
        key="iface.flash_kb",
        label="Flash (KB)",
        hint="On-chip flash size in kilobytes.",
        value_type="number",
        unit="KB",
        samples=[256, 2048, 8192],
        namespace="iface"
    ),
    AttributeKeyDefinition(
        key="iface.ram_kb",
        label="RAM (KB)",
        hint="On-chip RAM size in kilobytes.",
        value_type="number",
        unit="KB",
        samples=[64, 512],
        namespace="iface"
    ),

    # -------- Connectors / Cables --------
    AttributeKeyDefinition(
        key="conn.series",
        label="Connector Series",
        hint="Manufacturer series name (e.g., JST-XH, Molex Micro-Fit 3.0).",
        value_type="string",
        samples=["JST-XH", "Molex Micro-Fit 3.0"],
        namespace="conn"
    ),
    AttributeKeyDefinition(
        key="conn.gender",
        label="Gender",
        hint="Electrical gender or mating style.",
        value_type="string",
        allowed_values=["Male", "Female", "Socket", "Plug"],
        samples=["Female"],
        namespace="conn"
    ),
    AttributeKeyDefinition(
        key="conn.keying",
        label="Keying",
        hint="Keying/polarization features if present.",
        value_type="string",
        samples=["Polarized", "Keyed"],
        namespace="conn"
    ),
    AttributeKeyDefinition(
        key="conn.shielded?",
        label="Shielded",
        hint="True if cable/connector is shielded.",
        value_type="boolean",
        samples=[True],
        namespace="conn"
    ),
    AttributeKeyDefinition(
        key="conn.length_mm",
        label="Cable Length (mm)",
        hint="Overall cable length in millimeters.",
        value_type="number",
        unit="mm",
        samples=[100, 500, 1000],
        namespace="conn"
    ),
    AttributeKeyDefinition(
        key="conn.gauge_awg",
        label="Wire Gauge (AWG)",
        hint="American Wire Gauge number (lower is thicker).",
        value_type="number",
        unit="AWG",
        samples=[28, 22, 18],
        namespace="conn"
    ),

    # -------- Sensors & Actuators --------
    AttributeKeyDefinition(
        key="elec.measurand",
        label="Measurand",
        hint="What is measured or actuated (e.g., temperature, light, motion).",
        value_type="string",
        samples=["Temperature", "Light", "Pressure", "Motion"],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.range_min",
        label="Range Min",
        hint="Lower bound of measurement range; include unit in hint/notes if ambiguous.",
        value_type="number",
        samples=[-40, 0],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.range_max",
        label="Range Max",
        hint="Upper bound of measurement range.",
        value_type="number",
        samples=[85, 125, 100000],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.accuracy",
        label="Accuracy",
        hint="Accuracy as text (e.g., '±1% FS', '±0.5 °C typical').",
        value_type="string",
        samples=["±1% FS", "±0.5 °C"],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.torque_kgcm",
        label="Torque (kg·cm)",
        hint="Servo/motor torque in kg·cm (or use N·m in notes).",
        value_type="number",
        unit="kg·cm",
        samples=[2.5, 10.0],
        namespace="elec"
    ),
    AttributeKeyDefinition(
        key="elec.stall_current_a",
        label="Stall Current (A)",
        hint="Approximate stall current for motors in amperes.",
        value_type="number",
        unit="A",
        samples=[1.5, 3.2],
        namespace="elec"
    ),

    # -------- Lifecycle / Sourcing --------
    AttributeKeyDefinition(
        key="meta.status",
        label="Lifecycle Status",
        hint="Manufacturer lifecycle status if known.",
        value_type="string",
        allowed_values=["Active", "NRND", "EOL"],
        samples=["Active"],
        namespace="meta"
    ),
    AttributeKeyDefinition(
        key="meta.substitutes_list",
        label="Substitutes",
        hint="Short IDs or MPNs that are acceptable drop-in replacements.",
        value_type="string_list",
        samples=[["IRLZ44N", "IRLZ34N"]],
        namespace="meta"
    ),
    AttributeKeyDefinition(
        key="meta.packaging",
        label="Packaging Form",
        hint="How the parts are stored from vendor.",
        value_type="string",
        allowed_values=["Reel", "Cut-tape", "Tube", "Tray", "Loose", "Bag"],
        samples=["Cut-tape"],
        namespace="meta"
    ),
])
