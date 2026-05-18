import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

interface GroupEntry {
  id: number;
  name: string;
  group: string;
  plant: string;
  description: string;
}

const GROUP_ICONS: Record<string, string> = {
  receiving_site: '📋',
  shipping_planning: '🗂️',
  shipping_logistics: '📦',
  management: '✅',
  finance: '💰',
  receiving_logistics: '🏭',
};

const GROUP_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  receiving_site:    { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-800' },
  shipping_planning: { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-800' },
  shipping_logistics:{ bg: 'bg-teal-50',   border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-800' },
  management:        { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800' },
  finance:           { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-800' },
  receiving_logistics:{ bg: 'bg-orange-50',border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800' },
};

export function GroupSelector() {
  const { selectGroup } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<GroupEntry[]>([]);
  const [selecting, setSelecting] = useState<number | null>(null);

  useEffect(() => {
    api.get('/auth/groups').then(r => setGroups(r.data));
  }, []);

  async function handleSelect(groupId: number) {
    setSelecting(groupId);
    try {
      await selectGroup(groupId);
      navigate('/dashboard');
    } finally {
      setSelecting(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-blue-900 text-white px-8 py-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-bold tracking-wide">STO Management</h1>
          <p className="text-blue-300 text-sm">Stock Transfer Order System</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Select Your Group</h2>
            <p className="text-gray-500">Choose the group you belong to. You'll see and edit only what's relevant to your role in the process.</p>
            <div className="mt-3 inline-block bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1.5 rounded-full font-medium">
              Demo mode — Active Directory integration pending
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {groups.map(g => {
              const colors = GROUP_COLORS[g.group] || { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-700' };
              const isSelecting = selecting === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => handleSelect(g.id)}
                  disabled={selecting !== null}
                  className={`
                    text-left p-5 rounded-xl border-2 transition-all duration-150
                    ${colors.bg} ${colors.border}
                    hover:shadow-md hover:scale-[1.02] active:scale-[0.99]
                    disabled:opacity-60 disabled:cursor-not-allowed
                    ${isSelecting ? 'ring-2 ring-blue-400' : ''}
                  `}
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">{GROUP_ICONS[g.group] || '👤'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{g.name}</span>
                        {g.plant !== 'ALL' && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>{g.plant}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{g.description}</p>
                    </div>
                    <span className="text-gray-300 text-lg mt-1">{isSelecting ? '⏳' : '→'}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            When Active Directory is connected, your group will be detected automatically from your network login.
          </p>
        </div>
      </div>
    </div>
  );
}
