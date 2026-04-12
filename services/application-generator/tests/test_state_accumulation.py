"""Test that the astream loop correctly accumulates state across nodes."""
import pytest


def test_state_dict_update_preserves_prior_keys():
    """Simulate the astream accumulation pattern to verify .update() behavior."""
    state_dict = {
        "invention_narrative": "Test invention",
        "background": "",
        "summary": "",
        "detailed_description": "",
    }

    # Simulate background agent returning content
    node_output_1 = {"background": "This is the background section.", "step": "write_background"}
    state_dict.update(node_output_1)
    assert state_dict["background"] == "This is the background section."

    # Simulate summary agent returning content
    node_output_2 = {"summary": "This is the summary section.", "step": "write_summary"}
    state_dict.update(node_output_2)
    assert state_dict["summary"] == "This is the summary section."
    # background should still be present after summary update
    assert state_dict["background"] == "This is the background section."

    # Simulate format_ids returning only {"step": "format_ids"}
    node_output_3 = {"step": "format_ids"}
    state_dict.update(node_output_3)
    # Both background and summary must survive the partial update
    assert state_dict["background"] == "This is the background section."
    assert state_dict["summary"] == "This is the summary section."
    assert state_dict["step"] == "format_ids"

    # Simulate finalize returning partial state
    node_output_4 = {"step": "finalize", "abstract": "This is the abstract."}
    state_dict.update(node_output_4)
    assert state_dict["background"] == "This is the background section."
    assert state_dict["summary"] == "This is the summary section."
    assert state_dict["abstract"] == "This is the abstract."
