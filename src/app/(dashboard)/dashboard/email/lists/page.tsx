"use client";

import { useState } from "react";
import {
  PlusIcon,
  UsersIcon,
  Trash2Icon,
  PencilIcon,
  UploadIcon,
  UserMinusIcon,
  ListIcon,
  SearchIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function EmailListsPage() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";

  // State
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addSubsOpen, setAddSubsOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [emailsInput, setEmailsInput] = useState("");
  const [search, setSearch] = useState("");

  // Queries
  const listsQuery = trpc.email["lists.list"].useQuery(
    { workspaceId },
    { enabled: !!workspaceId }
  );

  // Mutations
  const createMutation = trpc.email["lists.create"].useMutation({
    onSuccess: () => {
      listsQuery.refetch();
      setCreateOpen(false);
      setForm({ name: "", description: "" });
    },
  });

  const updateMutation = trpc.email["lists.update"].useMutation({
    onSuccess: () => {
      listsQuery.refetch();
      setEditOpen(false);
    },
  });

  const deleteMutation = trpc.email["lists.delete"].useMutation({
    onSuccess: () => listsQuery.refetch(),
  });

  const addSubsMutation = trpc.email["lists.addSubscribers"].useMutation({
    onSuccess: () => {
      listsQuery.refetch();
      setAddSubsOpen(false);
      setEmailsInput("");
    },
  });

  const removeSubsMutation = trpc.email["lists.removeSubscribers"].useMutation({
    onSuccess: () => listsQuery.refetch(),
  });

  // Filtered lists
  const filteredLists = (listsQuery.data ?? []).filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      (l.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createMutation.mutate({
      workspaceId,
      name: form.name,
      description: form.description || undefined,
    });
  };

  const handleUpdate = () => {
    if (!selectedListId || !form.name.trim()) return;
    updateMutation.mutate({
      workspaceId,
      id: selectedListId,
      name: form.name,
      description: form.description || undefined,
    });
  };

  const handleAddSubscribers = () => {
    if (!selectedListId || !emailsInput.trim()) return;
    const emails = emailsInput
      .split(/[,\n\r]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    if (emails.length === 0) return;
    addSubsMutation.mutate({ workspaceId, listId: selectedListId, emails });
  };

  const openEdit = (list: { id: string; name: string; description: string | null }) => {
    setSelectedListId(list.id);
    setForm({ name: list.name, description: list.description ?? "" });
    setEditOpen(true);
  };

  const openAddSubs = (listId: string) => {
    setSelectedListId(listId);
    setEmailsInput("");
    setAddSubsOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Lists</h1>
          <p className="text-muted-foreground">
            Manage your subscriber lists and segments.
          </p>
        </div>
        <Button onClick={() => { setForm({ name: "", description: "" }); setCreateOpen(true); }}>
          <PlusIcon className="h-4 w-4 mr-2" />
          New List
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lists..."
          className="pl-9"
        />
      </div>

      {/* Lists grid */}
      {listsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : filteredLists.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <ListIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No email lists yet</p>
          <p className="text-sm mt-1">Create your first list to start collecting subscribers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLists.map((list) => (
            <div
              key={list.id}
              className="border rounded-lg p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                    <UsersIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{list.name}</h3>
                    {list.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {list.description}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant="secondary">{list.subscriberCount} subscribers</Badge>
              </div>

              <p className="text-xs text-muted-foreground mt-3">
                Created {new Date(list.createdAt).toLocaleDateString()}
              </p>

              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openAddSubs(list.id)}
                >
                  <UploadIcon className="h-3 w-3 mr-1" />
                  Add Subscribers
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(list)}
                >
                  <PencilIcon className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deleteMutation.mutate({ workspaceId, id: list.id })}
                >
                  <Trash2Icon className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create List Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Email List</DialogTitle>
            <DialogDescription>
              Create a new list to organize your email subscribers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>List Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g., Newsletter Subscribers"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of this list"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit List Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit List</DialogTitle>
            <DialogDescription>Update the list details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>List Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!form.name.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Subscribers Dialog */}
      <Dialog open={addSubsOpen} onOpenChange={setAddSubsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subscribers</DialogTitle>
            <DialogDescription>
              Enter email addresses separated by commas or one per line.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Email Addresses</Label>
            <textarea
              className="w-full rounded-md border px-3 py-2 text-sm min-h-[120px] resize-y mt-1"
              value={emailsInput}
              onChange={(e) => setEmailsInput(e.target.value)}
              placeholder={"john@example.com\njane@example.com\nbob@example.com"}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {emailsInput
                .split(/[,\n\r]+/)
                .filter((e) => e.trim().includes("@")).length}{" "}
              valid email(s) detected
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSubscribers}
              disabled={addSubsMutation.isPending}
            >
              {addSubsMutation.isPending ? "Adding..." : "Add Subscribers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
