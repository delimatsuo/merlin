"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAdminStore, type AdminUser } from "@/lib/store";

interface UserDetail {
  uid: string;
  profiles: { id: string; name: string; status: string; createdAt: string }[];
  applications: {
    id: string;
    title: string;
    company: string;
    status: string;
    createdAt: string;
  }[];
}

export default function AdminUsuarios() {
  const { users, setUsers, usersCursor, setUsersCursor, usersHasMore, setUsersHasMore } =
    useAdminStore();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchUsers = useCallback(
    async (cursor = "", searchQuery = "") => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (cursor) params.set("cursor", cursor);
        if (searchQuery) params.set("search", searchQuery);
        const data = await api.get<{
          users: AdminUser[];
          nextCursor: string;
          hasMore: boolean;
        }>(`/api/admin/users?${params}`);
        if (cursor) {
          useAdminStore.getState().appendUsers(data.users);
        } else {
          setUsers(data.users);
        }
        setUsersCursor(data.nextCursor);
        setUsersHasMore(data.hasMore);
      } catch {
        // error handled by api client
      } finally {
        setLoading(false);
      }
    },
    [setUsers, setUsersCursor, setUsersHasMore]
  );

  useEffect(() => {
    if (users.length === 0) fetchUsers();
  }, [fetchUsers, users.length]);

  const handleSearch = () => {
    fetchUsers("", search.trim());
  };

  const handleExpand = async (uid: string) => {
    if (expandedUid === uid) {
      setExpandedUid(null);
      setDetail(null);
      return;
    }
    setExpandedUid(uid);
    setDetailLoading(true);
    try {
      const data = await api.get<UserDetail>(`/api/admin/users/${uid}`);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleDisable = async (uid: string, currentlyDisabled: boolean) => {
    const action = currentlyDisabled ? "enable" : "disable";
    const confirm = window.confirm(
      currentlyDisabled
        ? "Reabilitar este usuário?"
        : "Desabilitar este usuário? Tokens serão revogados imediatamente."
    );
    if (!confirm) return;

    try {
      await api.post(`/api/admin/users/${uid}/${action}`);
      // Refresh the list
      fetchUsers("", search.trim());
    } catch {
      // handled by api client
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Usuários</h1>

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Buscar por email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={handleSearch}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-xs font-medium hover:opacity-90 transition-opacity"
        >
          Buscar
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b border-border/50 text-muted-foreground">
              <th className="text-left py-2.5 px-4 font-medium">Email</th>
              <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">
                Nome
              </th>
              <th className="text-right py-2.5 px-4 font-medium">Perfis</th>
              <th className="text-right py-2.5 px-4 font-medium">Vagas</th>
              <th className="text-right py-2.5 px-4 font-medium">Gerações</th>
              <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">
                Cadastro
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.uid}
                user={u}
                expanded={expandedUid === u.uid}
                detail={expandedUid === u.uid ? detail : null}
                detailLoading={expandedUid === u.uid && detailLoading}
                onExpand={() => handleExpand(u.uid)}
                onToggleDisable={(disabled) => handleToggleDisable(u.uid, disabled)}
              />
            ))}
          </tbody>
        </table>

        {users.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Nenhum usuário encontrado.
          </p>
        )}
      </div>

      {usersHasMore && (
        <button
          onClick={() => fetchUsers(usersCursor, search.trim())}
          disabled={loading}
          className="w-full rounded-lg border border-border/50 py-2 text-xs font-medium hover:bg-muted/30 transition-colors disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Carregar mais"}
        </button>
      )}
    </div>
  );
}

function UserRow({
  user,
  expanded,
  detail,
  detailLoading,
  onExpand,
  onToggleDisable,
}: {
  user: AdminUser;
  expanded: boolean;
  detail: UserDetail | null;
  detailLoading: boolean;
  onExpand: () => void;
  onToggleDisable: (currentlyDisabled: boolean) => void;
}) {
  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={onExpand}
      >
        <td className="py-2.5 px-4 font-mono">{user.email}</td>
        <td className="py-2.5 px-4 hidden md:table-cell">{user.name || "—"}</td>
        <td className="py-2.5 px-4 text-right">{user.profileCount}</td>
        <td className="py-2.5 px-4 text-right">{user.applicationCount}</td>
        <td className="py-2.5 px-4 text-right">{user.generationCount}</td>
        <td className="py-2.5 px-4 hidden md:table-cell text-muted-foreground">
          {user.createdAt
            ? new Date(user.createdAt).toLocaleDateString("pt-BR")
            : "—"}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-muted/10 px-6 py-4">
            {detailLoading ? (
              <p className="text-xs text-muted-foreground">Carregando detalhes...</p>
            ) : detail ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDisable(false);
                    }}
                    className="rounded-lg bg-destructive/10 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/20 transition-colors"
                  >
                    Desabilitar
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDisable(true);
                    }}
                    className="rounded-lg bg-green-500/10 text-green-600 px-3 py-1.5 text-xs font-medium hover:bg-green-500/20 transition-colors"
                  >
                    Reabilitar
                  </button>
                </div>

                {detail.profiles.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium mb-1">
                      Perfis ({detail.profiles.length})
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {detail.profiles.map((p) => (
                        <li key={p.id}>
                          {p.name || "Sem nome"} — {p.status}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.applications.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium mb-1">
                      Candidaturas ({detail.applications.length})
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {detail.applications.map((a) => (
                        <li key={a.id}>
                          {a.company} — {a.title} ({a.status})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Erro ao carregar detalhes.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
