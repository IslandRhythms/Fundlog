<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useToast } from 'vue-toastification';
import LoadingView from '../components/LoadingView.vue';
import { useDomainStore } from '../stores/domain';
import { hideBsModal } from '../shared/hideBsModal';
import type { CreditCard, CreditCardPerk } from '../shared/types';

const domain = useDomainStore();
const toast = useToast();

const cards = ref<CreditCard[]>([]);
const loading = ref(false);

const cardName = ref('');
const cardIssuer = ref('');
const cardLastFour = ref('');
const cardNetwork = ref('');
const cardAnnualFee = ref<number | null>(null);
const cardBenefitsNotes = ref('');
const newCardPerkLabel = ref('');
const newCardPerkTags = ref('');
const newCardPerkCashback = ref('');

const editingCard = ref<CreditCard | null>(null);

const perkCardId = ref<number | null>(null);
const perkLabel = ref('');
const perkTags = ref('');
const perkCashback = ref('');
const editingPerk = ref<{ cardId: number; perk: CreditCardPerk } | null>(null);

const activeProfileId = computed(() => domain.activeProfileId);

async function loadCards() {
  if (!activeProfileId.value) {
    cards.value = [];
    return;
  }
  loading.value = true;
  try {
    cards.value = await window.fundlog.card.listByProfile(activeProfileId.value);
  } catch (e) {
    console.error(e);
    toast.error('Failed to load cards.');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await domain.loadProfiles();
  await loadCards();
});

function openAddCardModal() {
  editingCard.value = null;
  cardName.value = '';
  cardIssuer.value = '';
  cardLastFour.value = '';
  cardNetwork.value = '';
  cardAnnualFee.value = null;
  cardBenefitsNotes.value = '';
  newCardPerkLabel.value = '';
  newCardPerkTags.value = '';
  newCardPerkCashback.value = '';
}

function openEditCardModal(c: CreditCard) {
  editingCard.value = c;
  cardName.value = c.name;
  cardIssuer.value = c.issuer ?? '';
  cardLastFour.value = c.lastFour ?? '';
  cardNetwork.value = c.network ?? '';
  cardAnnualFee.value = c.annualFee;
  cardBenefitsNotes.value = c.benefitsNotes ?? '';
}

function openAddPerkModal(cardId: number) {
  perkCardId.value = cardId;
  perkLabel.value = '';
  perkTags.value = '';
  perkCashback.value = '';
  editingPerk.value = null;
}

function openEditPerkModal(cardId: number, perk: CreditCardPerk) {
  perkCardId.value = cardId;
  editingPerk.value = { cardId, perk };
  perkLabel.value = perk.label;
  perkTags.value = perk.categoryTags ?? '';
  perkCashback.value = perk.cashbackDetail;
}

function perkTagTokens(tags: string | null | undefined): string[] {
  if (!tags?.trim()) return [];
  return tags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function activePerkFor(card: CreditCard): CreditCardPerk | null {
  if (card.activePerkId == null) return null;
  return card.perks.find((p) => p.id === card.activePerkId) ?? null;
}

async function submitCard() {
  if (!activeProfileId.value || !cardName.value.trim()) return;
  const isEdit = !!editingCard.value;
  try {
    if (editingCard.value) {
      await window.fundlog.card.update({
        id: editingCard.value.id,
        name: cardName.value.trim(),
        issuer: cardIssuer.value.trim() || null,
        lastFour: cardLastFour.value.trim() || null,
        network: cardNetwork.value.trim() || null,
        annualFee: cardAnnualFee.value,
        benefitsNotes: cardBenefitsNotes.value.trim() || null,
      });
      toast.success('Card updated.');
    } else {
      const created = await window.fundlog.card.create({
        profileId: activeProfileId.value,
        name: cardName.value.trim(),
        issuer: cardIssuer.value.trim() || null,
        lastFour: cardLastFour.value.trim() || null,
        network: cardNetwork.value.trim() || null,
        annualFee: cardAnnualFee.value,
        benefitsNotes: cardBenefitsNotes.value.trim() || null,
      });
      if (newCardPerkLabel.value.trim()) {
        await window.fundlog.card.perkCreate({
          cardId: created.id,
          label: newCardPerkLabel.value.trim(),
          categoryTags: newCardPerkTags.value.trim() || null,
          cashbackDetail: newCardPerkCashback.value.trim() || '',
        });
      }
      toast.success('Card added.');
    }
    editingCard.value = null;
    await loadCards();
    hideBsModal(isEdit ? 'editCardModal' : 'addCardModal');
  } catch (e) {
    console.error(e);
    toast.error('Could not save card.');
  }
}

async function removeCard(id: number) {
  if (!confirm('Delete this card and all its perks?')) return;
  try {
    await window.fundlog.card.delete(id);
    toast.success('Card removed.');
    await loadCards();
  } catch (e) {
    console.error(e);
    toast.error('Could not delete card.');
  }
}

async function submitPerk() {
  const cid = perkCardId.value;
  if (!cid || !perkLabel.value.trim()) return;
  try {
    if (editingPerk.value) {
      await window.fundlog.card.perkUpdate({
        id: editingPerk.value.perk.id,
        label: perkLabel.value.trim(),
        categoryTags: perkTags.value.trim() || null,
        cashbackDetail: perkCashback.value.trim() || '',
      });
      toast.success('Perk updated.');
    } else {
      await window.fundlog.card.perkCreate({
        cardId: cid,
        label: perkLabel.value.trim(),
        categoryTags: perkTags.value.trim() || null,
        cashbackDetail: perkCashback.value.trim() || '',
      });
      toast.success('Perk added.');
    }
    editingPerk.value = null;
    perkCardId.value = null;
    await loadCards();
    hideBsModal('addPerkModal');
  } catch (e) {
    console.error(e);
    toast.error('Could not save perk.');
  }
}

async function removePerk(perkId: number) {
  if (!confirm('Delete this perk?')) return;
  try {
    await window.fundlog.card.perkDelete(perkId);
    toast.success('Perk removed.');
    await loadCards();
  } catch (e) {
    console.error(e);
    toast.error('Could not delete perk.');
  }
}

async function setActivePerk(cardId: number, perkId: number | null) {
  try {
    await window.fundlog.card.setActivePerk({ cardId, perkId });
    toast.success(perkId ? 'Active perk updated.' : 'Cleared active perk.');
    await loadCards();
  } catch (e) {
    console.error(e);
    toast.error('Could not set active perk.');
  }
}
</script>

<template>
  <div class="view credit-cards-view container-fluid">
    <h2 class="mb-2">Cards</h2>
    <p class="view-subtitle mb-2 small">
      One earn type per perk (e.g. groceries vs dining). Mark which perk is
      <strong>active</strong> when you use it at checkout.
    </p>

    <p v-if="!activeProfileId" class="status-text">
      Create a profile in Settings to manage cards.
    </p>

    <template v-else>
      <div class="mb-3">
        <button
          type="button"
          class="btn btn-sm btn-primary"
          data-bs-toggle="modal"
          data-bs-target="#addCardModal"
          @click="openAddCardModal"
        >
          Add card
        </button>
      </div>

      <div v-if="loading" class="credit-cards-empty-hint mb-3">
        <LoadingView message="Loading cards…" />
      </div>
      <div v-else-if="!cards.length" class="credit-cards-empty-hint mb-3">
        <p class="credit-cards-empty-title">No cards yet</p>
        <p class="credit-cards-empty-muted mb-2">
          Add a card, then add <strong>one perk per earn type</strong> (e.g. groceries vs dining vs
          gas). Use <strong>Set as active</strong> on the perk you’re maximizing this month or at
          checkout.
        </p>
        <p class="credit-cards-empty-muted mb-0">
          Optional: when adding a card, create a first perk in the same flow—add the rest with
          <strong>Add perk</strong> on the card.
        </p>
      </div>

      <div v-else class="row gy-4">
        <div v-for="c in cards" :key="c.id" class="col-12">
          <div class="card credit-cards-card border shadow-none">
            <div class="credit-cards-card-accent" aria-hidden="true" />
            <div
              class="card-header d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 py-3 px-3 bg-transparent border-bottom border-secondary-subtle"
            >
              <div class="flex-grow-1 min-w-0">
                <div class="d-flex flex-wrap align-items-baseline gap-2 mb-2">
                  <h3 class="credit-cards-card-title h6 mb-0 text-break">{{ c.name }}</h3>
                  <span v-if="c.issuer" class="small text-muted">{{ c.issuer }}</span>
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <span
                    v-if="c.lastFour"
                    class="badge rounded-pill font-monospace fw-normal px-2 py-1 bg-transparent text-body-secondary border border-secondary-subtle"
                  >
                    •••• {{ c.lastFour }}
                  </span>
                  <span
                    v-if="c.network"
                    class="badge rounded-pill fw-normal px-2 py-1 bg-transparent text-body-secondary border border-secondary-subtle"
                  >
                    {{ c.network }}
                  </span>
                  <span
                    v-if="c.annualFee != null"
                    class="badge rounded-pill fw-normal px-2 py-1 bg-transparent text-body-secondary border border-secondary-subtle"
                  >
                    {{ c.annualFee.toLocaleString() }} / yr
                  </span>
                </div>
              </div>
              <div class="btn-group btn-group-sm flex-shrink-0" role="group" aria-label="Card actions">
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  data-bs-toggle="modal"
                  data-bs-target="#editCardModal"
                  @click="openEditCardModal(c)"
                >
                  Edit
                </button>
                <button type="button" class="btn btn-outline-danger" @click="removeCard(c.id)">
                  Remove
                </button>
              </div>
            </div>

            <div class="card-body p-3 d-flex flex-column gap-3">
              <p
                v-if="c.benefitsNotes"
                class="credit-cards-notes small text-muted mb-0 rounded-2 border border-secondary-subtle px-3 py-2"
              >
                {{ c.benefitsNotes }}
              </p>

              <div
                class="credit-cards-active small px-3 py-2"
                :class="{ 'credit-cards-active--picked': !!activePerkFor(c) }"
              >
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <span class="credit-cards-section-label mb-0">Active</span>
                  <template v-if="activePerkFor(c)">
                    <span class="fw-semibold text-body mb-0">{{ activePerkFor(c)?.label }}</span>
                    <button
                      type="button"
                      class="btn btn-link btn-sm py-0 px-1 ms-sm-auto link-secondary"
                      @click="setActivePerk(c.id, null)"
                    >
                      Clear
                    </button>
                  </template>
                  <template v-else-if="c.perks.length">
                    <span class="text-muted mb-0">None selected — pick one below</span>
                  </template>
                  <template v-else>
                    <span class="text-muted mb-0">Add perks first</span>
                  </template>
                </div>
              </div>

              <div
                class="d-flex flex-wrap justify-content-between align-items-center gap-2 pb-2 border-bottom border-secondary-subtle"
              >
                <span class="credit-cards-section-label mb-0">Perks</span>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  data-bs-toggle="modal"
                  data-bs-target="#addPerkModal"
                  @click="openAddPerkModal(c.id)"
                >
                  Add perk
                </button>
              </div>

              <div v-if="c.perks.length" class="vstack gap-2">
                <div
                  v-for="p in c.perks"
                  :key="p.id"
                  class="credit-cards-perk d-flex rounded-2 border border-secondary-subtle overflow-hidden"
                  :class="{ 'credit-cards-perk--active': c.activePerkId === p.id }"
                >
                  <div class="credit-cards-perk-rail" aria-hidden="true" />
                  <div class="flex-grow-1 min-w-0 py-2 ps-3 pe-2">
                    <div class="row g-2 align-items-start">
                      <div class="col">
                        <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                          <span class="fw-semibold small mb-0">{{ p.label }}</span>
                          <span
                            v-if="c.activePerkId === p.id"
                            class="badge rounded-pill bg-transparent text-primary border border-primary border-opacity-50 perk-active-badge"
                          >
                            Active
                          </span>
                        </div>
                        <div
                          v-if="perkTagTokens(p.categoryTags).length"
                          class="d-flex flex-wrap gap-1 mb-1"
                        >
                          <span
                            v-for="tok in perkTagTokens(p.categoryTags)"
                            :key="tok"
                            class="badge rounded-pill bg-transparent text-body-secondary border border-secondary-subtle fw-normal px-2 py-1 perk-tag-badge"
                          >
                            {{ tok }}
                          </span>
                        </div>
                        <p v-if="p.cashbackDetail?.trim()" class="small text-muted mb-0">
                          {{ p.cashbackDetail }}
                        </p>
                      </div>
                      <div class="col-auto">
                        <div class="d-flex flex-wrap gap-1 justify-content-end">
                          <button
                            v-if="c.activePerkId !== p.id"
                            type="button"
                            class="btn btn-sm btn-outline-primary"
                            @click="setActivePerk(c.id, p.id)"
                          >
                            Set active
                          </button>
                          <button v-else type="button" class="btn btn-sm btn-primary" disabled>
                            Active
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary"
                            data-bs-toggle="modal"
                            data-bs-target="#addPerkModal"
                            @click="openEditPerkModal(c.id, p)"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-outline-danger"
                            @click="removePerk(p.id)"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="text-muted small mb-0">No perks yet.</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <div
    id="addCardModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="addCardModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="addCardModalLabel" class="modal-title">Add card</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <div class="modal-body row g-3">
          <div class="col-12">
            <label class="form-label">Name <span class="text-danger">*</span></label>
            <input v-model="cardName" type="text" class="form-control" placeholder="Sapphire Preferred" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Issuer</label>
            <input v-model="cardIssuer" type="text" class="form-control" placeholder="Chase" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Last four</label>
            <input v-model="cardLastFour" type="text" maxlength="4" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Network</label>
            <input v-model="cardNetwork" type="text" class="form-control" placeholder="Visa" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Annual fee</label>
            <input v-model.number="cardAnnualFee" type="number" min="0" step="1" class="form-control" />
          </div>
          <div class="col-12">
            <label class="form-label">Benefits &amp; notes</label>
            <textarea
              v-model="cardBenefitsNotes"
              class="form-control"
              rows="3"
              placeholder="Lounge access, travel credits, referral bonus…"
            />
          </div>
          <div class="col-12">
            <hr class="my-2" />
            <p class="form-label mb-2">
              First perk <span class="fw-normal text-muted">(optional)</span>
            </p>
            <p class="small text-muted mb-2">
              One row = one perk. Example: label <strong>3% groceries</strong>, category tag
              <strong>groceries</strong>. Add dining and gas as separate perks after saving the card.
            </p>
            <div class="row g-2">
              <div class="col-12">
                <input
                  v-model="newCardPerkLabel"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="e.g. 3% groceries"
                />
              </div>
              <div class="col-12">
                <input
                  v-model="newCardPerkTags"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Category tag(s), comma-separated — e.g. groceries"
                />
              </div>
              <div class="col-12">
                <textarea
                  v-model="newCardPerkCashback"
                  class="form-control form-control-sm"
                  rows="2"
                  placeholder="Caps, dates, or fine print (optional)"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="submitCard">
            Save
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    id="editCardModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="editCardModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="editCardModalLabel" class="modal-title">Edit card</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <div class="modal-body row g-3">
          <div class="col-12">
            <label class="form-label">Name <span class="text-danger">*</span></label>
            <input v-model="cardName" type="text" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Issuer</label>
            <input v-model="cardIssuer" type="text" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Last four</label>
            <input v-model="cardLastFour" type="text" maxlength="4" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Network</label>
            <input v-model="cardNetwork" type="text" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Annual fee</label>
            <input v-model.number="cardAnnualFee" type="number" min="0" step="1" class="form-control" />
          </div>
          <div class="col-12">
            <label class="form-label">Benefits &amp; notes</label>
            <textarea v-model="cardBenefitsNotes" class="form-control" rows="3" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="submitCard">
            Save
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    id="addPerkModal"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="addPerkModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="addPerkModalLabel" class="modal-title">
            {{ editingPerk ? 'Edit perk' : 'Add perk' }}
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <div class="modal-body">
          <p class="small text-muted cc-perk-modal-intro">
            Each perk is <strong>one</strong> earn rule (e.g. <strong>3% on groceries</strong>). If the
            card also pays <strong>3% on dining</strong>, create <strong>another perk</strong> for dining.
            Use <strong>Set as active</strong> on the card to track which bonus you’re using now.
          </p>
          <div class="mb-3">
            <label class="form-label">Perk name <span class="text-danger">*</span></label>
            <input
              v-model="perkLabel"
              type="text"
              class="form-control"
              placeholder="e.g. 3% groceries, 2% gas, Q1 wholesale clubs"
            />
          </div>
          <div class="mb-3">
            <label class="form-label">Category / merchant tags <span class="text-muted">(optional)</span></label>
            <input
              v-model="perkTags"
              type="text"
              class="form-control"
              placeholder="Comma-separated — e.g. groceries, supermarkets"
            />
          </div>
          <div class="mb-0">
            <label class="form-label">Notes <span class="text-muted">(optional)</span></label>
            <textarea
              v-model="perkCashback"
              class="form-control"
              rows="3"
              placeholder="Spending caps, promo end dates, activation rules, portal bonuses…"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="submitPerk">
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
