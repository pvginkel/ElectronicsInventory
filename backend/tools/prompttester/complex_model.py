from typing import List, Dict, Union, Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class DocumentLink(BaseModel):
    """A link to a specific resource (datasheet, pinout, app note, generic webpage, or image)."""
    model_config = ConfigDict(extra="forbid")

    url: str = Field(...)
    title: Optional[str] = Field(..., description="Human-friendly title if known")
    media_type: Literal["pdf", "image", "webpage"] = Field(
        ..., description="Expected content type. Use 'pdf' only for downloadable PDFs."
    )

class PartAIModelAttributes(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # ----- Connectors / Cables -----
    conn_series: Optional[str] = Field(..., description="Manufacturer series name (e.g., JST-XH, Molex Micro-Fit 3.0).")
    conn_gender: Optional[str] = Field(..., description="Electrical gender or mating style.")
    conn_keying: Optional[str] = Field(..., description="Keying/polarization features if present.")
    conn_shielded: Optional[bool] = Field(..., description="True if cable/connector is shielded.")
    conn_length_mm: Optional[float] = Field(..., description="Overall cable length in millimeters.")
    conn_gauge_awg: Optional[int] = Field(..., description="American Wire Gauge number (lower is thicker).")

    # ----- Electrical (generic) -----
    elec_v_max_v: Optional[float] = Field(..., description="Absolute maximum voltage rating. Use volts (V).")
    elec_i_max_a: Optional[float] = Field(..., description="Absolute maximum continuous current. Use amperes (A).")
    elec_power_w: Optional[float] = Field(..., description="Rated power dissipation. Use watts (W).")
    elec_tolerance_pct: Optional[float] = Field(..., description="Percentage tolerance (e.g., 1, 5). Do not include the % symbol.")
    elec_value_ohm: Optional[float] = Field(..., description="Nominal resistance in ohms. Normalize to numeric ohms.")
    elec_value_f: Optional[float] = Field(..., description="Capacitance in farads. Use numeric F (e.g., 1e-6 for 1 µF).")
    elec_value_h: Optional[float] = Field(..., description="Inductance in henries. Use numeric H (e.g., 10e-6 for 10 µH).")

    # ----- Discretes / Power -----
    elec_vds_v: Optional[float] = Field(..., description="MOSFET drain-source voltage rating in volts.")
    elec_id_a: Optional[float] = Field(..., description="MOSFET continuous drain current at 25°C in amperes.")
    elec_rds_on_mohm: Optional[float] = Field(..., description="MOSFET on-resistance at specified gate voltage, in milliohms.")
    elec_logic_level: Optional[bool] = Field(..., description="True if the MOSFET fully enhances at 4–5 V or lower gate drive.")
    elec_forward_v_v: Optional[float] = Field(..., description="Typical forward voltage drop for diodes/LEDs in volts.")
    elec_if_a: Optional[float] = Field(..., description="Continuous forward current in amperes.")

    # ----- Sensors & Actuators -----
    elec_measurand: Optional[str] = Field(..., description="What is measured or actuated (e.g., temperature, light, motion).")
    elec_range_min: Optional[float] = Field(..., description="Lower bound of measurement range.")
    elec_range_max: Optional[float] = Field(..., description="Upper bound of measurement range.")
    elec_accuracy: Optional[str] = Field(..., description="Accuracy as text (e.g., '±1% FS', '±0.5 °C typical').")
    elec_torque_kgcm: Optional[float] = Field(..., description="Servo/motor torque in kg·cm.")
    elec_stall_current_a: Optional[float] = Field(..., description="Approximate stall current for motors in amperes.")

    # ----- Interfaces / MCUs -----
    iface_buses_list: List[str] = Field(..., description="Hardware buses supported (e.g., I2C, SPI, UART, USB).")
    iface_usb_role: Optional[str] = Field(..., description="USB role supported by the device (Device/Host/OTG).")
    iface_gpio_count: Optional[int] = Field(..., description="Approximate number of general-purpose I/O pins.")
    iface_clock_mhz: Optional[float] = Field(..., description="Nominal MCU core clock in MHz.")
    iface_flash_kb: Optional[int] = Field(..., description="On-chip flash size in kilobytes.")
    iface_ram_kb: Optional[int] = Field(..., description="On-chip RAM size in kilobytes.")

    # ----- Mechanical / Package -----
    mech_mounting: Optional[str] = Field(..., description="How it mounts: through-hole, surface-mount, panel, DIN-rail.")
    mech_orientation: Optional[str] = Field(..., description="Connector/part orientation relative to PCB (e.g., right-angle).")
    mech_size_mm: Optional[str] = Field(..., description="Overall L×W×H as free text; include 'mm', e.g., '7×7×0.9 mm'.")
    mech_esd_sensitive: Optional[bool] = Field(..., description="True if part requires ESD precautions (ICs, MOSFETs).")
    mech_msl: Optional[str] = Field(..., description="JEDEC MSL as text (e.g., 'MSL3').")

    # ----- Lifecycle / Sourcing -----
    meta_status: Optional[str] = Field(..., description="Manufacturer lifecycle status if known (Active/NRND/EOL).")
    meta_substitutes_list: List[str] = Field(..., description="Short IDs or MPNs that are acceptable drop-in replacements.")
    meta_packaging: Optional[str] = Field(..., description="How the parts are stored from vendor (Reel/Cut-tape/Tube/Tray/Loose/Bag).")

    # ----- Package / PCB -----
    pkg_package: Optional[str] = Field(..., description="Mechanical case/size code, exactly as the industry names it.")
    pkg_footprint: Optional[str] = Field(..., description="ECAD footprint name (KiCad/Eagle/Altium) if known.")
    pkg_pin_count: Optional[int] = Field(..., description="Total number of electrical pins or positions.")
    pkg_pitch_mm: Optional[float] = Field(..., description="Center-to-center distance for pins/contacts, in millimeters.")

    # ----- Power conversion -----
    power_v_in_min_v: Optional[float] = Field(..., description="Minimum input voltage for regulators/converters.")
    power_v_in_max_v: Optional[float] = Field(..., description="Maximum input voltage for regulators/converters.")
    power_v_out_v: List[float] = Field(..., description="Nominal output voltage(s) in volts; multiple rails allowed.")
    power_i_out_max_a: Optional[float] = Field(..., description="Maximum continuous output current per rail.")
    power_efficiency_pct: Optional[float] = Field(..., description="Typical peak efficiency percentage (0–100).")

class PartAIModel(BaseModel):
    """Single-part description for AI to fill. Keep optional so unknowns can be left null/empty."""
    model_config = ConfigDict(extra="forbid")

    product_name: Optional[str] = Field(...)
    category: Optional[str] = Field(..., description="Pick from provided categories")
    manufacturer: Optional[str] = Field(...)
    manufacturer_part_number: Optional[str] = Field(..., description="Manufacturer part number (MPN)")
    datasheet: Optional[DocumentLink] = Field(..., description="Prefer a direct PDF if publicly available")
    product_page: Optional[str] = Field(...)
    product_images: List[DocumentLink] = Field(..., description="Product/board images")
    pinout_diagram: Optional[DocumentLink] = Field(...)
    schematic: Optional[DocumentLink] = Field(...)
    app_note: Optional[DocumentLink] = Field(...)
    tags: List[str] = Field(...)
    notes: Optional[str] = Field(...)
    attributes: PartAIModelAttributes = Field(...)

from typing import List, Optional, Literal, Union
from pydantic import BaseModel, Field


ValueType = Literal[
    "string", "number", "boolean",
    "string_list", "number_list", "boolean_list"
]


class AttributeKeyDefinition(BaseModel):
    """
    Metadata for a curated attribute key. Use to drive UI hints, AI extraction,
    normalization, and faceting.
    """
    key: str                          # e.g. "pkg.package"
    label: str                        # e.g. "Package"
    hint: str                         # guidance for AI/users; include units and extraction tips
    value_type: ValueType
    unit: Optional[str] = None        # canonical unit for numeric keys (if any)
    samples: List[Union[str, float, int, List[Union[str, int, float]]]] = Field(...)
    allowed_values: Optional[List[str]] = None   # for (semi-)enumerations
    synonyms: List[str] = Field(default_factory=list)  # AI mapping
    facet: bool = True                # good to facet/filter on?
    namespace: Optional[str] = None   # e.g., "pkg", "elec", "iface", "conn", "power", "mech", "meta"

    model_config = {"extra": "forbid"}


class AttributeRegistry(BaseModel):
    keys: List[AttributeKeyDefinition]
