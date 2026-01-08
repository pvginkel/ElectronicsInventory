import logging
import os

from dotenv import load_dotenv

from tools.prompttester.prompt_tests import (
    run_datasheet_spec_tests,
    run_duplicate_search_tests,
    run_full_tests,
)
from tools.prompttester.utils import AIType

logger = logging.getLogger(__name__)

# Load .env from the prompttester directory (where CLAUDE_API_KEY is stored)
_prompttester_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_prompttester_dir, ".env"))

def full_tests():
    reasoning_efforts : list[str] = [
        # "low",
        "medium",
        # "high",
    ]

    models : list[tuple[AIType, str, list[str] | None]] = [
        (AIType.OPENAI, "gpt-5-mini", reasoning_efforts),
        # (AIType.CLAUDE, "claude-sonnet-4-5", None),
        # (AIType.CLAUDE, "claude-opus-4-5", None),
        # (AIType.CLAUDE, "claude-3-5-haiku-20241022", None),
    ]

    queries = [
        # "HLK PM24",
        # "relay 12V SPDT 5A",
        # "SN74HC595N",
        # "ESP32-S3FN8",
        # "Arduino Nano Every",
        # "DFRobot Gravity SGP40",
        # "generic tht resistor 1/4w 1% 10k",
        # "banana",
        # "sharp c n12 pc817",
        "IRLZ44N",
        # "Ben's electronics Oled i2c 0.96 inch geel blauw 128*64",
        # "Ben's Electronics SKU KO70",
        # "TCRT5000",
    ]

    run_full_tests(
        queries,
        models,
        1
    )

def duplicate_search_tests():
    queries : list[tuple[str, list[tuple[str, str]]]] = [
        ("Part number SN74HC595N", [
            ("ABCD", "high"), # 8-bit shift register with output latches; exact MPN match
        ]),
        # ("10k resistor", [
        #     ("CDEF", "medium"), # 10kΩ carbon film resistor 1/4W THT
        #     ("IJMN", "medium")  # 10kΩ SMD resistor 0805 package
        # ]),
        # ("10k SMD resistor", [
        #     ("IJMN", "high") # 10kΩ SMD resistor 0805 package - specific match
        # ]),
        # ("ESP32 WiFi module", [
        #     ("IJKL", "high") # ESP32-WROOM-32 WiFi & Bluetooth module
        # ]),
        # ("Generic THT diode", []) # No specific match expected (too generic)
    ]

    run_duplicate_search_tests(
        queries,
        [
            # (AIType.OPENAI, "gpt-5-mini"),
            (AIType.CLAUDE, "claude-sonnet-4-5"),
        ]
    )

def datasheet_spec_tests():
    queries : list[tuple[str, str]] = [
        # ("Part number SN74HC595N", "https://www.ti.com/lit/ds/symlink/sn54hc595.pdf"),
        ("IRLZ44N", "https://www.infineon.com/assets/row/public/documents/24/49/infineon-irlz44n-datasheet-en.pdf"),

    ]

    run_datasheet_spec_tests(
        queries,
        [
            (AIType.OPENAI, "gpt-5-mini"),
            # (AIType.CLAUDE, "claude-sonnet-4-5"),
        ]
    )

def main():
    full_tests()
    # duplicate_search_tests()
    # datasheet_spec_tests()

if __name__ == "__main__":
    main()
