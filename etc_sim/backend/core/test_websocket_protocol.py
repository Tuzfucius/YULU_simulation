import unittest

from etc_sim.backend.core.websocket_manager import SimulationSession, WebSocketManager


class _WebSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, message):
        self.messages.append(message)


class WebSocketProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def test_init_accepts_only_camel_case_config(self):
        websocket = _WebSocket()
        session = SimulationSession("test", websocket)
        manager = WebSocketManager()

        await manager._handle_init(session, {"config": {"totalVehicles": 10}})

        self.assertEqual(websocket.messages[-1]["type"], "INIT_COMPLETE")
        self.assertEqual(websocket.messages[-1]["payload"]["config"]["totalVehicles"], 10)

    async def test_init_rejects_legacy_config_shape(self):
        websocket = _WebSocket()
        session = SimulationSession("test", websocket)
        manager = WebSocketManager()

        await manager._handle_init(session, {"config": {"total_vehicles": 10}})

        self.assertEqual(websocket.messages[-1]["type"], "ERROR")
        self.assertEqual(websocket.messages[-1]["payload"]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
