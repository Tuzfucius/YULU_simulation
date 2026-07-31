import unittest

from pydantic import ValidationError

from etc_sim.backend.models.schemas import ConfigCreateRequest
from etc_sim.config.parameters import SimulationConfig


class SimulationConfigProtocolTests(unittest.TestCase):
    def test_defaults_serialize_to_camel_case(self):
        config = SimulationConfig.from_wire({})

        payload = config.to_wire_dict()
        self.assertIn("roadLengthKm", payload)
        self.assertIn("customGantryPositionsKm", payload)
        self.assertNotIn("road_length_km", payload)

    def test_wire_input_rejects_snake_case_and_unknown_fields(self):
        with self.assertRaises(ValidationError):
            SimulationConfig.from_wire({"road_length_km": 10})
        with self.assertRaises(ValidationError):
            SimulationConfig.from_wire({"roadLengthKm": 10, "obsolete": True})

    def test_cross_field_validation_rejects_invalid_gantries(self):
        with self.assertRaises(ValidationError):
            SimulationConfig.from_wire({
                "roadLengthKm": 10,
                "customGantryPositionsKm": [6, 4],
            })
        with self.assertRaises(ValidationError):
            SimulationConfig.from_wire({
                "roadLengthKm": 10,
                "segmentLengthKm": 11,
            })

    def test_config_api_request_uses_the_same_wire_model(self):
        request = ConfigCreateRequest.model_validate({
            "name": "test",
            "config": {"roadLengthKm": 12, "totalVehicles": 10},
        })

        self.assertEqual(request.config.road_length_km, 12)
        self.assertEqual(request.config.to_wire_dict()["totalVehicles"], 10)
        with self.assertRaises(ValidationError):
            ConfigCreateRequest.model_validate({
                "name": "old",
                "config": {"road": {"road_length_km": 12}},
            })


if __name__ == "__main__":
    unittest.main()
