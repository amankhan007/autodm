const { getDB } = require('../config/database');

function mapCampaign(row) {
  if (!row) return null;
  const c = {
    _id: row.id, id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    status: row.status,
    selectedPosts: row.selected_posts || [],
    messageTemplate: row.message_template,
    keywordTriggers: row.keyword_triggers || [],
    useKeywordTrigger: row.use_keyword_trigger,
    ignoreDuplicates: row.ignore_duplicates,
    spamFilter: row.spam_filter,
    delayMin: row.delay_min,
    delayMax: row.delay_max,
    maxDmsPerDay: row.max_dms_per_day,
    stats: {
      totalComments: row.stat_total_comments,
      dmsSent: row.stat_dms_sent,
      dmsFailed: row.stat_dms_failed,
      conversions: row.stat_conversions,
    },
    repliedUsers: row.replied_users || [],
    lastTriggeredAt: row.last_triggered_at,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  c.hasReplied = function (commenterId, postId) {
    return this.repliedUsers.includes(`${commenterId}_${postId}`);
  };
  Object.defineProperty(c, 'conversionRate', {
    get() {
      if (!this.stats.totalComments) return 0;
      return Math.round((this.stats.dmsSent / this.stats.totalComments) * 100);
    }
  });

  return c;
}

const Campaign = {
  async findById(id) {
    const { data } = await getDB().from('campaigns').select('*').eq('id', id).maybeSingle();
    return mapCampaign(data);
  },

  async findOne(query) {
    let q = getDB().from('campaigns').select('*');
    if (query._id || query.id) q = q.eq('id', query._id || query.id);
    if (query.userId)          q = q.eq('user_id', query.userId);
    if (query.status)          q = q.eq('status', query.status);
    const { data } = await q.limit(1).maybeSingle();
    return mapCampaign(data);
  },

  async find(query = {}) {
    let q = getDB().from('campaigns').select('*').order('created_at', { ascending: false });
    if (query.userId)  q = q.eq('user_id', query.userId);
    if (query.status)  q = q.eq('status', query.status);
    // Filter by post ID inside JSONB array
    if (query['selectedPosts.postId']) {
      q = q.contains('selected_posts', [{ postId: query['selectedPosts.postId'] }]);
    }
    const { data } = await q;
    return (data || []).map(mapCampaign);
  },

  // Find active campaigns that include a given postId
  async findActiveForPost(userId, postId) {
    const { data } = await getDB()
      .from('campaigns')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .contains('selected_posts', JSON.stringify([{ postId }]));
    // contains on JSONB array may not work for partial objects — fallback filter
    const all = (data || []).map(mapCampaign);
    return all.filter(c => c.selectedPosts.some(p => p.postId === postId));
  },

  async create(fields) {
    const { data, error } = await getDB().from('campaigns').insert({
      user_id: fields.userId,
      name: fields.name,
      description: fields.description || null,
      status: fields.status || 'draft',
      selected_posts: fields.selectedPosts || [],
      message_template: fields.messageTemplate,
      keyword_triggers: fields.keywordTriggers || [],
      use_keyword_trigger: fields.useKeywordTrigger || false,
      ignore_duplicates: fields.ignoreDuplicates !== false,
      spam_filter: fields.spamFilter !== false,
      delay_min: fields.delayMin ?? 5,
      delay_max: fields.delayMax ?? 20,
      max_dms_per_day: fields.maxDmsPerDay || 100,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapCampaign(data);
  },

  async update(id, userId, fields) {
    const patch = {};
    if (fields.name !== undefined)           patch.name = fields.name;
    if (fields.description !== undefined)    patch.description = fields.description;
    if (fields.status !== undefined)         patch.status = fields.status;
    if (fields.selectedPosts !== undefined)  patch.selected_posts = fields.selectedPosts;
    if (fields.messageTemplate !== undefined) patch.message_template = fields.messageTemplate;
    if (fields.keywordTriggers !== undefined) patch.keyword_triggers = fields.keywordTriggers;
    if (fields.useKeywordTrigger !== undefined) patch.use_keyword_trigger = fields.useKeywordTrigger;
    if (fields.spamFilter !== undefined)     patch.spam_filter = fields.spamFilter;
    if (fields.delayMin !== undefined)       patch.delay_min = fields.delayMin;
    if (fields.delayMax !== undefined)       patch.delay_max = fields.delayMax;
    if (fields.maxDmsPerDay !== undefined)   patch.max_dms_per_day = fields.maxDmsPerDay;
    if (fields.startedAt !== undefined)      patch.started_at = fields.startedAt;
    if (fields.pausedAt !== undefined)       patch.paused_at = fields.pausedAt;
    if (fields.lastTriggeredAt !== undefined) patch.last_triggered_at = fields.lastTriggeredAt;

    let q = getDB().from('campaigns').update(patch).eq('id', id);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q.select().maybeSingle();
    if (error) throw new Error(error.message);
    return mapCampaign(data);
  },

  async delete(id, userId) {
    let q = getDB().from('campaigns').delete().eq('id', id);
    if (userId) q = q.eq('user_id', userId);
    const { error } = await q;
    if (error) throw new Error(error.message);
  },

  async incrementStat(id, field) {
    // field: 'totalComments' | 'dmsSent' | 'dmsFailed'
    const colMap = { totalComments: 'stat_total_comments', dmsSent: 'stat_dms_sent', dmsFailed: 'stat_dms_failed' };
    const col = colMap[field];
    if (!col) return;
    const { data } = await getDB().from('campaigns').select(col).eq('id', id).single();
    if (data) await getDB().from('campaigns').update({ [col]: (data[col] || 0) + 1 }).eq('id', id);
  },

  async addRepliedUser(id, commenterId, postId) {
    const key = `${commenterId}_${postId}`;
    // Append to array using Postgres concat operator via rpc or read-then-write
    const { data } = await getDB().from('campaigns').select('replied_users').eq('id', id).single();
    if (!data) return;
    const arr = data.replied_users || [];
    if (!arr.includes(key)) {
      await getDB().from('campaigns').update({ replied_users: [...arr, key] }).eq('id', id);
    }
  },

  async count(query = {}) {
    let q = getDB().from('campaigns').select('*', { count: 'exact', head: true });
    if (query.userId) q = q.eq('user_id', query.userId);
    if (query.status) q = q.eq('status', query.status);
    const { count } = await q;
    return count || 0;
  },
};

module.exports = Campaign;
