"""Focused standard-library tests: python3 -B scripts/test_public_cache_proof.py."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("proof", Path(__file__).with_name("public-cache-proof.py"))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


def row(ms=40, **overrides):
    return {"curl_exit": 0, "status": 200, "ttfb_ms": ms,
            "headers": {"cf-cache-status": ["HIT"], "age": ["1"],
                        "content-type": ["text/html; charset=utf-8"]}, **overrides}


class ProofTests(unittest.TestCase):
    def test_nearest_rank_not_median(self):
        result = proof.summarize([row(x) for x in [1, 2, 3, 4, 5, 6, 7]], 7)
        self.assertEqual(result["sample_p75_ms"], 6)
        self.assertTrue(result["passed"])

    def test_internal_hit_does_not_prove_edge_hit(self):
        self.assertFalse(proof.summarize([row(headers={"x-nextjs-cache": ["HIT"]})], 1)["passed"])

    def test_failed_or_missing_samples_fail_closed(self):
        for rows in [[], [row(status=500)], [row(curl_exit=28)], [row(ttfb_ms=None)]]:
            self.assertFalse(proof.summarize(rows, 1)["passed"])

    def test_private_response_is_never_a_public_cache_pass(self):
        for key, value in [("set-cookie", "a=private"), ("cache-control", "private"),
                           ("cache-control", "no-store"), ("cache-control", "no-cache"),
                           ("age", "invalid"), ("content-type", "text/x-component")]:
            sample = row()
            sample["headers"][key] = [value]
            self.assertFalse(proof.summarize([sample], 1)["passed"])

    def test_warm_budget_cannot_hide_a_slow_sample(self):
        self.assertFalse(proof.summarize([row(10), row(51)], 2)["passed"])

    def test_final_response_and_duplicate_headers(self):
        parsed = proof.final_headers("HTTP/1.1 200 Connection established\r\nAge: 5\r\n\r\n"
                                     "HTTP/2 200\r\nVary: RSC\r\nVary: Accept-Encoding\r\n")
        self.assertNotIn("age", parsed)
        self.assertEqual(parsed["vary"], ["RSC", "Accept-Encoding"])


if __name__ == "__main__":
    unittest.main()
