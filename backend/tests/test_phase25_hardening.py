import unittest

import app.models  # noqa: F401
from app.db.database import Base
from app.main import app
from app.state import can_transition


class StateTransitionTests(unittest.TestCase):
    def test_meeting_transition_is_linear(self):
        self.assertTrue(can_transition("meeting", "READY", "ACTIVE"))
        self.assertTrue(can_transition("meeting", "ACTIVE", "ENDED"))
        self.assertFalse(can_transition("meeting", "READY", "ENDED"))
        self.assertFalse(can_transition("meeting", "ENDED", "ACTIVE"))

    def test_issue_transition_is_linear(self):
        self.assertTrue(can_transition("issue", "OPEN", "IN_PROGRESS"))
        self.assertTrue(can_transition("issue", "IN_PROGRESS", "CLOSED"))
        self.assertFalse(can_transition("issue", "OPEN", "CLOSED"))
        self.assertFalse(can_transition("issue", "CLOSED", "OPEN"))

    def test_alert_pending_transition_matches_policy(self):
        self.assertTrue(can_transition("alert", "PENDING", "ACKNOWLEDGED"))
        self.assertTrue(can_transition("alert", "PENDING", "DISMISSED"))
        self.assertFalse(can_transition("alert", "PENDING", "RESOLVED"))
        self.assertTrue(can_transition("alert", "ACKNOWLEDGED", "RESOLVED"))


class ApiContractTests(unittest.TestCase):
    def test_invitation_list_and_cancel_routes_exist(self):
        paths = app.openapi()["paths"]
        self.assertIn("get", paths["/workspaces/{workspace_id}/invitations"])
        self.assertIn(
            "delete",
            paths["/workspaces/{workspace_id}/invitations/{invitation_id}"],
        )

    def test_unhandled_exception_handler_is_registered(self):
        self.assertIn(Exception, app.exception_handlers)


class DatabaseConstraintTests(unittest.TestCase):
    def constraint_names(self, table_name):
        return {
            constraint.name
            for constraint in Base.metadata.tables[table_name].constraints
            if constraint.name
        }

    def test_role_and_status_check_constraints_exist(self):
        self.assertIn(
            "ck_workspace_members_role",
            self.constraint_names("workspace_members"),
        )
        self.assertIn(
            "ck_workspace_invitations_role",
            self.constraint_names("workspace_invitations"),
        )
        self.assertIn(
            "ck_workspace_invitations_status",
            self.constraint_names("workspace_invitations"),
        )
        self.assertIn("ck_meetings_status", self.constraint_names("meetings"))
        self.assertIn("ck_issues_status", self.constraint_names("issues"))
        self.assertIn("ck_alerts_status", self.constraint_names("alerts"))

    def test_pending_invitation_unique_index_exists(self):
        indexes = {
            index.name: index
            for index in Base.metadata.tables["workspace_invitations"].indexes
        }
        index = indexes["uq_workspace_invitations_pending_workspace_user"]
        self.assertTrue(index.unique)
        self.assertIsNotNone(index.dialect_options["postgresql"]["where"])

    def test_added_foreign_keys_exist(self):
        issue_assignee = Base.metadata.tables["issues"].c.assignee_id
        audit_workspace = Base.metadata.tables["audit_logs"].c.workspace_id
        self.assertEqual(
            {foreign_key.target_fullname for foreign_key in issue_assignee.foreign_keys},
            {"auth.id"},
        )
        self.assertEqual(
            {foreign_key.target_fullname for foreign_key in audit_workspace.foreign_keys},
            {"workspaces.id"},
        )


if __name__ == "__main__":
    unittest.main()
