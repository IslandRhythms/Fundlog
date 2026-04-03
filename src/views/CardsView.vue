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

async function submitCard() {
  if (!activeProfileId.value || !cardName.value.trim()) return;
  const isEdit = !!editingCard.value;
  if (
    !isEdit &&
    newCardPerkLabel.value.trim() &&
    !newCardPerkCashback.value.trim()
  ) {
    toast.error('Enter cashback details for the first perk, or clear the perk label.');
    return;
  }
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
      if (
        newCardPerkLabel.value.trim() &&
        newCardPerkCashback.value.trim()
      ) {
        await window.fundlog.card.perkCreate({
          cardId: created.id,
          label: newCardPerkLabel.value.trim(),
          categoryTags: newCardPerkTags.value.trim() || null,
          cashbackDetail: newCardPerkCashback.value.trim(),
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
  if (!cid || !perkLabel.value.trim() || !perkCashback.value.trim()) return;
  try {
    if (editingPerk.value) {
      await window.fundlog.card.perkUpdate({
        id: editingPerk.value.perk.id,
        label: perkLabel.value.trim(),
        categoryTags: perkTags.value.trim() || null,
        cashbackDetail: perkCashback.value.trim(),
      });
      toast.success('Perk updated.');
    } else {
      await window.fundlog.card.perkCreate({
        cardId: cid,
        label: perkLabel.value.trim(),
        categoryTags: perkTags.value.trim() || null,
        cashbackDetail: perkCashback.value.trim(),
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
    <p class="view-subtitle mb-4">
      Track credit cards, benefits, and which cashback or promo perk you are using now.
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
          Add a card with the button above. After it appears in the list, open that card and use
          <strong>Add perk</strong> for cashback rules, category bonuses, or limited-time deals.
        </p>
        <p class="credit-cards-empty-muted mb-0">
          Tip: in <strong>Add card</strong>, you can fill the optional <strong>First perk</strong> fields to create a perk in the same step.
        </p>
      </div>

      <div v-else class="row g-3">
        <div v-for="c in cards" :key="c.id" class="col-lg-6">
          <section class="card h-100">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <h3 class="h5 card-title mb-1">{{ c.name }}</h3>
                  <div class="small text-muted">
                    <span v-if="c.issuer">{{ c.issuer }}</span>
                    <span v-if="c.lastFour"> · •••• {{ c.lastFour }}</span>
                    <span v-if="c.network"> · {{ c.network }}</span>
                    <span v-if="c.annualFee != null">
                      · {{ c.annualFee.toLocaleString() }} annual fee
                    </span>
                  </div>
                </div>
                <div class="d-flex flex-wrap gap-1 justify-content-end">
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-secondary"
                    data-bs-toggle="modal"
                    data-bs-target="#editCardModal"
                    @click="openEditCardModal(c)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-outline-danger"
                    @click="removeCard(c.id)"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p v-if="c.benefitsNotes" class="small mb-3">{{ c.benefitsNotes }}</p>

              <div class="d-flex justify-content-between align-items-center mb-2">
                <h4 class="h6 mb-0">Perks &amp; cashback</h4>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary"
                  data-bs-toggle="modal"
                  data-bs-target="#addPerkModal"
                  @click="openAddPerkModal(c.id)"
                >
                  Add perk
                </button>
              </div>

              <ul v-if="c.perks.length" class="list-unstyled mb-0">
                <li
                  v-for="p in c.perks"
                  :key="p.id"
                  class="perk-row border rounded p-2 mb-2"
                  :class="{ 'border-success': c.activePerkId === p.id }"
                >
                  <div class="d-flex justify-content-between align-items-start gap-2">
                    <div>
                      <div class="fw-semibold">
                        {{ p.label }}
                        <span v-if="c.activePerkId === p.id" class="badge bg-success ms-1">
                          Active
                        </span>
                      </div>
                      <div v-if="p.categoryTags" class="small text-muted">
                        {{ p.categoryTags }}
                      </div>
                      <p class="small mb-0 mt-1">{{ p.cashbackDetail }}</p>
                    </div>
                    <div class="d-flex flex-column gap-1 flex-shrink-0">
                      <button
                        v-if="c.activePerkId !== p.id"
                        type="button"
                        class="btn btn-sm btn-success"
                        @click="setActivePerk(c.id, p.id)"
                      >
                        Set active
                      </button>
                      <button
                        v-else
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        @click="setActivePerk(c.id, null)"
                      >
                        Clear
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
                </li>
              </ul>
              <p v-else class="small text-muted mb-0">No perks yet.</p>
            </div>
          </section>
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
            <p class="form-label mb-2">First perk <span class="fw-normal text-muted">(optional)</span></p>
            <p class="small text-muted mb-2">
              Add a cashback or promotion entry now, or skip and use <strong>Add perk</strong> on the card later.
            </p>
            <div class="row g-2">
              <div class="col-12">
                <input
                  v-model="newCardPerkLabel"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Label (e.g. Q1 grocery 5%)"
                />
              </div>
              <div class="col-12">
                <input
                  v-model="newCardPerkTags"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Categories / merchants (optional)"
                />
              </div>
              <div class="col-12">
                <textarea
                  v-model="newCardPerkCashback"
                  class="form-control form-control-sm"
                  rows="2"
                  placeholder="Cashback or deal details (required if label is filled)"
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
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="addPerkModalLabel" class="modal-title">
            {{ editingPerk ? 'Edit perk' : 'Add perk' }}
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" />
        </div>
        <div class="modal-body">
          <div class="mb-2">
            <label class="form-label">Label <span class="text-danger">*</span></label>
            <input v-model="perkLabel" type="text" class="form-control" placeholder="Q1 grocery 5%" />
          </div>
          <div class="mb-2">
            <label class="form-label">Categories / merchants (optional)</label>
            <input
              v-model="perkTags"
              type="text"
              class="form-control"
              placeholder="Groceries, dining, Amazon…"
            />
          </div>
          <div class="mb-0">
            <label class="form-label">Cashback / deal details <span class="text-danger">*</span></label>
            <textarea
              v-model="perkCashback"
              class="form-control"
              rows="4"
              placeholder="5% back at supermarkets up to $1,500 spend Jan–Mar…"
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
