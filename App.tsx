import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'card-transactions-manager-v1';

type CardType = 'Credit' | 'Debit' | 'UPI' | 'Cash';
type TabKey = 'cards' | 'transactions' | 'payments';

type CardAccount = {
  id: string;
  name: string;
  last4: string;
  type: CardType;
  billGenerationDate: string;
  billDueDate: string;
  expiry: string;
  creditLimit: number;
  openingOutstanding: number;
  createdAt: string;
};

type CardTransaction = {
  id: string;
  cardId: string;
  amount: number;
  date: string;
  remarks: string;
  createdAt: string;
};

type BillPayment = {
  id: string;
  cardId: string;
  amount: number;
  date: string;
  createdAt: string;
};

type Store = {
  cards: CardAccount[];
  transactions: CardTransaction[];
  payments: BillPayment[];
};

type Theme = ReturnType<typeof createTheme>;

const CARD_TYPES: CardType[] = ['Credit', 'Debit', 'UPI', 'Cash'];

const today = () => formatDate(new Date());
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateString(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function monthTitle(date: Date) {
  return `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}
const parseMoney = (value: string) => Number(value.replace(/,/g, '').trim() || '0');
const money = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

function createTheme(isDark: boolean) {
  return {
    isDark,
    bg: isDark ? '#07111F' : '#F4F7FB',
    card: isDark ? '#101C2E' : '#FFFFFF',
    elevated: isDark ? '#17243A' : '#FFFFFF',
    text: isDark ? '#F5F8FF' : '#0B1728',
    muted: isDark ? '#9BA8BC' : '#65748B',
    border: isDark ? '#25334A' : '#E0E7F1',
    primary: '#2563EB',
    primarySoft: isDark ? '#173B83' : '#EAF1FF',
    success: '#059669',
    successSoft: isDark ? '#0B3B31' : '#E7F8F1',
    danger: '#DC2626',
    dangerSoft: isDark ? '#4A1820' : '#FEECEC',
    warning: '#D97706',
    warningSoft: isDark ? '#4B3214' : '#FFF5DB',
    shadow: isDark ? '#000000' : '#9BA8BC',
  };
}

const seedData: Store = {
  cards: [
    {
      id: 'seed-card-1',
      name: 'HDFC Regalia',
      last4: '4831',
      type: 'Credit',
      billGenerationDate: '05',
      billDueDate: '25',
      expiry: '09/28',
      creditLimit: 250000,
      openingOutstanding: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'seed-card-2',
      name: 'UPI Wallet',
      last4: '0000',
      type: 'UPI',
      billGenerationDate: '-',
      billDueDate: '-',
      expiry: '-',
      creditLimit: 0,
      openingOutstanding: 0,
      createdAt: new Date().toISOString(),
    },
  ],
  transactions: [
    { id: 'seed-txn-1', cardId: 'seed-card-1', amount: 3499, date: today(), remarks: 'Groceries and household', createdAt: new Date().toISOString() },
    { id: 'seed-txn-2', cardId: 'seed-card-1', amount: -499, date: today(), remarks: 'Refund received', createdAt: new Date().toISOString() },
    { id: 'seed-txn-3', cardId: 'seed-card-2', amount: 850, date: today(), remarks: 'Dinner via UPI', createdAt: new Date().toISOString() },
  ],
  payments: [
    { id: 'seed-pay-1', cardId: 'seed-card-1', amount: 1000, date: today(), createdAt: new Date().toISOString() },
  ],
};

function getOutstanding(cardId: string, store: Store) {
  const card = store.cards.find((item) => item.id === cardId);
  const spent = store.transactions.filter((item) => item.cardId === cardId).reduce((sum, item) => sum + item.amount, 0);
  const paid = store.payments.filter((item) => item.cardId === cardId).reduce((sum, item) => sum + item.amount, 0);
  return (card?.openingOutstanding ?? 0) + spent - paid;
}

function getCardName(cards: CardAccount[], cardId: string) {
  const card = cards.find((item) => item.id === cardId);
  return card ? `${card.name} • ${card.last4}` : 'Deleted card';
}

function sortByDate<T extends { date: string; createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

export default function App() {
  const colorScheme = useColorScheme();
  const theme = useMemo(() => createTheme(colorScheme === 'dark'), [colorScheme]);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [fontsLoaded] = useFonts({ ...Ionicons.font });
  const [store, setStore] = useState<Store>({ cards: [], transactions: [], payments: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('cards');
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [txnModalOpen, setTxnModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardAccount | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setStore(JSON.parse(raw));
        } else {
          setStore(seedData);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
        }
      } catch {
        setStore(seedData);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const persist = useCallback(async (next: Store) => {
    setStore(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('Local save warning:', error);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 550);
  }, []);

  const summary = useMemo(() => {
    const totalOutstanding = store.cards.reduce((sum, card) => sum + getOutstanding(card.id, store), 0);
    const totalLimit = store.cards.reduce((sum, card) => sum + card.creditLimit, 0);
    const month = today().slice(0, 7);
    const monthSpend = store.transactions.filter((item) => item.date.startsWith(month) && item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
    const monthPayments = store.payments.filter((item) => item.date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0);
    return { totalOutstanding, totalLimit, monthSpend, monthPayments };
  }, [store]);

  if (!fontsLoaded || loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <View style={styles.loaderIcon}><Ionicons name="card" size={30} color={theme.primary} /></View>
        <Text style={styles.loadingTitle}>Loading local ledger</Text>
        <Text style={styles.loadingText}>Everything stays offline on this iPhone.</Text>
      </SafeAreaView>
    );
  }

  const renderScreen = () => {
    if (activeTab === 'transactions') {
      return <TransactionsScreen store={store} persist={persist} theme={theme} styles={styles} refreshing={refreshing} onRefresh={onRefresh} openAdd={() => setTxnModalOpen(true)} />;
    }
    if (activeTab === 'payments') {
      return <PaymentsScreen store={store} persist={persist} theme={theme} styles={styles} refreshing={refreshing} onRefresh={onRefresh} openAdd={() => setPayModalOpen(true)} />;
    }
    return <CardsScreen store={store} persist={persist} theme={theme} styles={styles} refreshing={refreshing} onRefresh={onRefresh} openAdd={() => setCardModalOpen(true)} openCard={setSelectedCard} summary={summary} />;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <View style={styles.appHeader}>
        <View>
          <View style={styles.kickerSpacer} />
          <Text style={styles.title}>Card Manager</Text>
        </View>
        <View style={styles.offlinePill}>
          <Ionicons name="phone-portrait" size={14} color={theme.success} />
          <Text style={styles.offlineText}>Local only</Text>
        </View>
      </View>

      <View style={styles.content}>{renderScreen()}</View>

      <View style={styles.tabBar}>
        <TabButton active={activeTab === 'cards'} label="Cards" icon="card" onPress={() => setActiveTab('cards')} theme={theme} styles={styles} />
        <TabButton active={activeTab === 'transactions'} label="Txns" icon="swap-horizontal" onPress={() => setActiveTab('transactions')} theme={theme} styles={styles} />
        <TabButton active={activeTab === 'payments'} label="Bills" icon="receipt" onPress={() => setActiveTab('payments')} theme={theme} styles={styles} />
      </View>

      <CardFormModal visible={cardModalOpen} onClose={() => setCardModalOpen(false)} store={store} persist={persist} theme={theme} styles={styles} />
      <TransactionFormModal visible={txnModalOpen} onClose={() => setTxnModalOpen(false)} store={store} persist={persist} theme={theme} styles={styles} />
      <PaymentFormModal visible={payModalOpen} onClose={() => setPayModalOpen(false)} store={store} persist={persist} theme={theme} styles={styles} />
      <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} store={store} theme={theme} styles={styles} />
    </SafeAreaView>
  );
}

function CardsScreen({ store, persist, theme, styles, refreshing, onRefresh, openAdd, openCard, summary }: any) {
  const deleteCard = (card: CardAccount) => {
    Alert.alert('Delete card?', `Remove ${card.name} and all linked transactions and payments from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => persist({
          cards: store.cards.filter((item: CardAccount) => item.id !== card.id),
          transactions: store.transactions.filter((item: CardTransaction) => item.cardId !== card.id),
          payments: store.payments.filter((item: BillPayment) => item.cardId !== card.id),
        }),
      },
    ]);
  };

  return (
    <FlatList
      data={store.cards}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Total outstanding</Text>
            <Text style={styles.heroAmount}>{money(summary.totalOutstanding)}</Text>
            <View style={styles.heroGrid}>
              <Metric label="Cards" value={`${store.cards.length}`} styles={styles} />
              <Metric label="Credit limit" value={money(summary.totalLimit)} styles={styles} />
              <Metric label="Month spends" value={money(summary.monthSpend)} styles={styles} />
              <Metric label="Bill paid" value={money(summary.monthPayments)} styles={styles} />
            </View>
          </View>
          <SectionHeader title="Card Details" action="Add card" icon="add" onPress={openAdd} styles={styles} />
        </View>
      }
      ListEmptyComponent={<EmptyState title="No cards yet" body="Add a debit, credit, UPI, or cash account to start tracking." icon="card-outline" theme={theme} styles={styles} />}
      renderItem={({ item }) => {
        const outstanding = getOutstanding(item.id, store);
        const utilization = item.creditLimit > 0 ? Math.min(Math.max(outstanding / item.creditLimit, 0), 1) : 0;
        return (
          <Pressable style={styles.cardTile} onPress={() => openCard(item)}>
            <View style={styles.cardTopRow}>
              <View style={[styles.cardIcon, { backgroundColor: typeColor(item.type, theme).soft }]}>
                <Ionicons name={typeIcon(item.type)} size={22} color={typeColor(item.type, theme).main} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>{item.type} • **** {item.last4 || '----'} • Exp {item.expiry || '-'}</Text>
              </View>
              <Pressable onPress={() => deleteCard(item)} hitSlop={10}>
                <Ionicons name="trash-outline" size={20} color={theme.muted} />
              </Pressable>
            </View>
            <View style={styles.amountRow}>
              <View>
                <Text style={styles.smallLabel}>Calculated outstanding</Text>
                <Text style={[styles.tileAmount, { color: outstanding >= 0 ? theme.text : theme.success }]}>{money(outstanding)}</Text>
              </View>
              <View style={styles.rightAligned}>
                <Text style={styles.smallLabel}>Bill cycle</Text>
                <Text style={styles.boldText}>Gen {item.billGenerationDate || '-'} • Due {item.billDueDate || '-'}</Text>
              </View>
            </View>
            {item.creditLimit > 0 && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${utilization * 100}%`, backgroundColor: utilization > 0.8 ? theme.danger : theme.primary }]} />
              </View>
            )}
          </Pressable>
        );
      }}
      contentContainerStyle={styles.listContent}
    />
  );
}

function TransactionsScreen({ store, persist, theme, styles, refreshing, onRefresh, openAdd }: any) {
  const txns = sortByDate<CardTransaction>(store.transactions);
  const deleteTxn = (txn: CardTransaction) => {
    Alert.alert('Delete transaction?', txn.remarks || money(txn.amount), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist({ ...store, transactions: store.transactions.filter((item: CardTransaction) => item.id !== txn.id) }) },
    ]);
  };
  const total = store.transactions.reduce((sum: number, item: CardTransaction) => sum + item.amount, 0);
  const refunds = store.transactions.filter((item: CardTransaction) => item.amount < 0).reduce((sum: number, item: CardTransaction) => sum + Math.abs(item.amount), 0);

  return (
    <FlatList
      data={txns}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.summaryRow}>
            <SummaryCard label="Net transactions" value={money(total)} icon="trending-up" theme={theme} styles={styles} />
            <SummaryCard label="Refunds" value={money(refunds)} icon="return-down-back" theme={theme} styles={styles} />
          </View>
          <SectionHeader title="Transaction Details" action="Add txn" icon="add" onPress={openAdd} styles={styles} />
        </View>
      }
      ListEmptyComponent={<EmptyState title="No transactions" body="Add spends as positive amounts and refunds as negative amounts." icon="swap-horizontal-outline" theme={theme} styles={styles} />}
      renderItem={({ item }) => <LedgerRow icon={item.amount >= 0 ? 'arrow-up-circle' : 'arrow-down-circle'} iconColor={item.amount >= 0 ? theme.danger : theme.success} title={item.remarks || 'Transaction'} subtitle={`${getCardName(store.cards, item.cardId)} • ${item.date}`} amount={money(item.amount)} onDelete={() => deleteTxn(item)} styles={styles} theme={theme} />}
      contentContainerStyle={styles.listContent}
    />
  );
}

function PaymentsScreen({ store, persist, theme, styles, refreshing, onRefresh, openAdd }: any) {
  const payments = sortByDate<BillPayment>(store.payments);
  const deletePayment = (payment: BillPayment) => {
    Alert.alert('Delete bill payment?', money(payment.amount), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist({ ...store, payments: store.payments.filter((item: BillPayment) => item.id !== payment.id) }) },
    ]);
  };
  const total = store.payments.reduce((sum: number, item: BillPayment) => sum + item.amount, 0);

  return (
    <FlatList
      data={payments}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.heroCardSmall}>
            <Text style={styles.heroLabel}>Total bill payments recorded</Text>
            <Text style={styles.heroAmountSmall}>{money(total)}</Text>
            <Text style={styles.heroSubtext}>Payments reduce the selected card's calculated outstanding automatically.</Text>
          </View>
          <SectionHeader title="Bill Payments" action="Add payment" icon="add" onPress={openAdd} styles={styles} />
        </View>
      }
      ListEmptyComponent={<EmptyState title="No bill payments" body="Record card bill payments to reduce outstanding balances." icon="receipt-outline" theme={theme} styles={styles} />}
      renderItem={({ item }) => <LedgerRow icon="checkmark-circle" iconColor={theme.success} title="Bill payment" subtitle={`${getCardName(store.cards, item.cardId)} • ${item.date}`} amount={money(item.amount)} onDelete={() => deletePayment(item)} styles={styles} theme={theme} />}
      contentContainerStyle={styles.listContent}
    />
  );
}

function CardFormModal({ visible, onClose, store, persist, theme, styles }: any) {
  const [name, setName] = useState('');
  const [last4, setLast4] = useState('');
  const [type, setType] = useState<CardType>('Credit');
  const [billGen, setBillGen] = useState('05');
  const [billDue, setBillDue] = useState('25');
  const [expiry, setExpiry] = useState('12/29');
  const [limit, setLimit] = useState('');
  const [opening, setOpening] = useState('0');

  const reset = () => { setName(''); setLast4(''); setType('Credit'); setBillGen('05'); setBillDue('25'); setExpiry('12/29'); setLimit(''); setOpening('0'); };
  const save = async () => {
    if (!name.trim()) { Alert.alert('Card name required', 'Enter a name like HDFC Regalia or Cash Wallet.'); return false; }
    if (last4.trim() && !/^\d{4}$/.test(last4.trim())) { Alert.alert('Invalid last 4 digits', 'Enter exactly four digits, or leave blank for cash.'); return false; }
    const card: CardAccount = { id: uid(), name: name.trim(), last4: last4.trim() || '0000', type, billGenerationDate: billGen.trim() || '-', billDueDate: billDue.trim() || '-', expiry: expiry.trim() || '-', creditLimit: Math.max(0, parseMoney(limit)), openingOutstanding: parseMoney(opening), createdAt: new Date().toISOString() };
    await persist({ ...store, cards: [card, ...store.cards] });
    onClose(); reset(); return true;
  };

  return (
    <FormModal visible={visible} title="Add card" onClose={onClose} onSave={save} styles={styles} theme={theme} saveLabel="Save card">
      <Input label="Card name" value={name} onChangeText={setName} placeholder="Axis Ace, SBI Cashback, Cash" styles={styles} />
      <Input label="Last 4 digits" value={last4} onChangeText={setLast4} keyboardType="number-pad" maxLength={4} placeholder="1234" styles={styles} />
      <Text style={styles.inputLabel}>Card type</Text>
      <View style={styles.chipRow}>{CARD_TYPES.map((item) => <ChoiceChip key={item} label={item} selected={type === item} onPress={() => setType(item)} styles={styles} theme={theme} />)}</View>
      <View style={styles.twoCol}>
        <Input label="Bill gen day" value={billGen} onChangeText={setBillGen} keyboardType="number-pad" placeholder="05" styles={styles} />
        <Input label="Bill due day" value={billDue} onChangeText={setBillDue} keyboardType="number-pad" placeholder="25" styles={styles} />
      </View>
      <View style={styles.twoCol}>
        <Input label="Expiry (MM/YY)" value={expiry} onChangeText={setExpiry} placeholder="09/28" styles={styles} />
        <Input label="Credit limit" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="250000" styles={styles} />
      </View>
      <Input label="Opening outstanding (optional)" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" placeholder="0" styles={styles} />
      <Text style={styles.formHint}>Current outstanding is calculated as opening outstanding + transactions - bill payments.</Text>
    </FormModal>
  );
}

function TransactionFormModal({ visible, onClose, store, persist, theme, styles }: any) {
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [remarks, setRemarks] = useState('');
  useEffect(() => { if (visible && store.cards[0] && !cardId) setCardId(store.cards[0].id); }, [visible, store.cards.length]);
  const save = async () => {
    if (!store.cards.length) { Alert.alert('Add a card first', 'Transactions must be linked to a card.'); return false; }
    const numeric = parseMoney(amount);
    if (!numeric) { Alert.alert('Amount required', 'Enter a positive spend or negative refund amount.'); return false; }
    const txn: CardTransaction = { id: uid(), cardId: cardId || store.cards[0].id, amount: numeric, date: date.trim() || today(), remarks: remarks.trim(), createdAt: new Date().toISOString() };
    await persist({ ...store, transactions: [txn, ...store.transactions] });
    onClose(); setAmount(''); setDate(today()); setRemarks(''); return true;
  };
  return (
    <FormModal visible={visible} title="Add transaction" onClose={onClose} onSave={save} styles={styles} theme={theme} saveLabel="Save txn">
      <CardPicker cards={store.cards} selectedId={cardId || store.cards[0]?.id} setSelectedId={setCardId} styles={styles} theme={theme} />
      <Input label="Amount (₹, use - for refund)" value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" placeholder="3499 or -499" styles={styles} />
      <DatePicker label="Date" value={date} onChange={setDate} styles={styles} theme={theme} />
      <Input label="Remarks" value={remarks} onChangeText={setRemarks} placeholder="Fuel, groceries, refund" styles={styles} />
    </FormModal>
  );
}

function PaymentFormModal({ visible, onClose, store, persist, theme, styles }: any) {
  const [cardId, setCardId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  useEffect(() => { if (visible && store.cards[0] && !cardId) setCardId(store.cards[0].id); }, [visible, store.cards.length]);
  const save = async () => {
    if (!store.cards.length) { Alert.alert('Add a card first', 'Bill payments must be linked to a card.'); return false; }
    const numeric = Math.abs(parseMoney(amount));
    if (!numeric) { Alert.alert('Amount required', 'Enter the bill amount paid.'); return false; }
    const payment: BillPayment = { id: uid(), cardId: cardId || store.cards[0].id, amount: numeric, date: date.trim() || today(), createdAt: new Date().toISOString() };
    await persist({ ...store, payments: [payment, ...store.payments] });
    onClose(); setAmount(''); setDate(today()); return true;
  };
  return (
    <FormModal visible={visible} title="Add bill payment" onClose={onClose} onSave={save} styles={styles} theme={theme} saveLabel="Save payment">
      <CardPicker cards={store.cards} selectedId={cardId || store.cards[0]?.id} setSelectedId={setCardId} styles={styles} theme={theme} />
      <Input label="Amount paid (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="10000" styles={styles} />
      <DatePicker label="Date" value={date} onChange={setDate} styles={styles} theme={theme} />
    </FormModal>
  );
}

function CardDetailModal({ card, onClose, store, theme, styles }: any) {
  if (!card) return null;
  const txns = sortByDate<CardTransaction>(store.transactions.filter((item: CardTransaction) => item.cardId === card.id)).slice(0, 8);
  const pays = sortByDate<BillPayment>(store.payments.filter((item: BillPayment) => item.cardId === card.id)).slice(0, 8);
  const outstanding = getOutstanding(card.id, store);
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <View><Text style={styles.modalTitle}>{card.name}</Text><Text style={styles.modalSub}>{card.type} • **** {card.last4}</Text></View>
          <Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={22} color={theme.text} /></Pressable>
        </View>
        <FlatList
          data={[...txns.map((item) => ({ kind: 'txn' as const, item })), ...pays.map((item) => ({ kind: 'pay' as const, item }))]}
          keyExtractor={(row) => `${row.kind}-${row.item.id}`}
          ListHeaderComponent={
            <View>
              <View style={styles.detailBalanceCard}>
                <Text style={styles.heroLabel}>Calculated outstanding</Text>
                <Text style={styles.heroAmount}>{money(outstanding)}</Text>
                <Text style={styles.heroSubtext}>Opening {money(card.openingOutstanding)} + spends/refunds − bill payments</Text>
              </View>
              <View style={styles.detailGrid}>
                <DetailMetric label="Limit" value={money(card.creditLimit)} styles={styles} />
                <DetailMetric label="Expiry" value={card.expiry} styles={styles} />
                <DetailMetric label="Bill gen" value={card.billGenerationDate} styles={styles} />
                <DetailMetric label="Due" value={card.billDueDate} styles={styles} />
              </View>
              <Text style={styles.sectionTitleOnly}>Linked activity</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState title="No linked activity" body="Add transactions or bill payments for this card." icon="file-tray-outline" theme={theme} styles={styles} />}
          renderItem={({ item: row }) => {
            if (row.kind === 'txn') {
              const txn = row.item as CardTransaction;
              return <LedgerRow icon={txn.amount >= 0 ? 'arrow-up-circle' : 'arrow-down-circle'} iconColor={txn.amount >= 0 ? theme.danger : theme.success} title={txn.remarks || 'Transaction'} subtitle={txn.date} amount={money(txn.amount)} styles={styles} theme={theme} />;
            }
            const payment = row.item as BillPayment;
            return <LedgerRow icon="checkmark-circle" iconColor={theme.success} title="Bill payment" subtitle={payment.date} amount={money(payment.amount)} styles={styles} theme={theme} />;
          }}
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    </Modal>
  );
}

function FormModal({ visible, title, onClose, onSave, children, styles, theme, saveLabel }: any) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) setSaving(false);
  }, [visible]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const didSave = await onSave();
      if (didSave === false) setSaving(false);
    } catch (error) {
      console.warn('Save warning:', error);
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flexOne}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={22} color={theme.text} /></Pressable>
          </View>
          <FlatList
            data={[{ key: 'form' }]}
            keyExtractor={(item) => item.key}
            renderItem={() => <View style={styles.formBody}>{children}<Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} disabled={saving} onPress={handleSave}><Text style={styles.saveButtonText}>{saving ? 'Saving...' : saveLabel}</Text></Pressable></View>}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.formListContent}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function CardPicker({ cards, selectedId, setSelectedId, styles, theme }: any) {
  const [open, setOpen] = useState(false);
  const selectedCard = cards.find((card: CardAccount) => card.id === selectedId) ?? cards[0];

  if (cards.length === 0) {
    return (
      <View>
        <Text style={styles.inputLabel}>Select card</Text>
        <Text style={styles.formHint}>No cards available. Add a card first.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.inputLabel}>Select card</Text>
      <Pressable style={styles.dropdownButton} onPress={() => setOpen(true)}>
        <View style={[styles.dropdownIcon, { backgroundColor: typeColor(selectedCard.type, theme).soft }]}>
          <Ionicons name={typeIcon(selectedCard.type)} size={19} color={typeColor(selectedCard.type, theme).main} />
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.dropdownTitle}>{selectedCard.name}</Text>
          <Text style={styles.dropdownSub}>{selectedCard.type} • **** {selectedCard.last4}</Text>
        </View>
        <Ionicons name="chevron-down" size={22} color={theme.muted} />
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dropdownSheet} onPress={() => undefined}>
            <View style={styles.dropdownSheetHeader}>
              <Text style={styles.dropdownSheetTitle}>Choose card</Text>
              <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>
            <FlatList
              data={cards}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const selected = item.id === selectedCard.id;
                return (
                  <Pressable
                    style={[styles.dropdownOption, selected && { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}
                    onPress={() => {
                      setSelectedId(item.id);
                      setOpen(false);
                    }}
                  >
                    <View style={[styles.dropdownIcon, { backgroundColor: typeColor(item.type, theme).soft }]}>
                      <Ionicons name={typeIcon(item.type)} size={19} color={typeColor(item.type, theme).main} />
                    </View>
                    <View style={styles.flexOne}>
                      <Text style={styles.dropdownTitle}>{item.name}</Text>
                      <Text style={styles.dropdownSub}>{item.type} • **** {item.last4} • Exp {item.expiry || '-'}</Text>
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={22} color={theme.primary} />}
                  </Pressable>
                );
              }}
              contentContainerStyle={styles.dropdownList}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function DatePicker({ label, value, onChange, styles, theme }: any) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const selected = parseDateString(value || today());
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });

  useEffect(() => {
    if (open) {
      const selected = parseDateString(value || today());
      setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
  }, [open, value]);

  const selectedDate = parseDateString(value || today());
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarCells = [
    ...Array.from({ length: firstDay }, (_, index) => ({ key: `blank-${index}`, day: 0 })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ key: `day-${index + 1}`, day: index + 1 })),
  ];

  const moveMonth = (direction: number) => {
    setVisibleMonth(new Date(year, month + direction, 1));
  };

  const chooseDate = (day: number) => {
    const next = new Date(year, month, day);
    onChange(formatDate(next));
    setOpen(false);
  };

  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable style={styles.dateButton} onPress={() => setOpen(true)}>
        <View style={styles.dateIcon}><Ionicons name="calendar" size={20} color={theme.primary} /></View>
        <View style={styles.flexOne}>
          <Text style={styles.dropdownTitle}>{value || today()}</Text>
          <Text style={styles.dropdownSub}>Tap to pick from calendar</Text>
        </View>
        <Ionicons name="chevron-down" size={22} color={theme.muted} />
      </Pressable>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.calendarSheet} onPress={() => undefined}>
            <View style={styles.dropdownSheetHeader}>
              <Text style={styles.dropdownSheetTitle}>Select date</Text>
              <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={20} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.calendarNav}>
              <Pressable style={styles.calendarNavButton} onPress={() => moveMonth(-1)}>
                <Ionicons name="chevron-back" size={22} color={theme.text} />
              </Pressable>
              <Text style={styles.calendarMonthTitle}>{monthTitle(visibleMonth)}</Text>
              <Pressable style={styles.calendarNavButton} onPress={() => moveMonth(1)}>
                <Ionicons name="chevron-forward" size={22} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {DAY_LABELS.map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}
            </View>
            <View style={styles.calendarGrid}>
              {calendarCells.map((cell) => {
                if (!cell.day) return <View key={cell.key} style={styles.dayCell} />;
                const isSelected = selectedDate.getFullYear() === year && selectedDate.getMonth() === month && selectedDate.getDate() === cell.day;
                const isToday = formatDate(new Date(year, month, cell.day)) === today();
                return (
                  <Pressable
                    key={cell.key}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected, isToday && !isSelected && styles.dayCellToday]}
                    onPress={() => chooseDate(cell.day)}
                  >
                    <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{cell.day}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.calendarActions}>
              <Pressable style={styles.todayButton} onPress={() => { onChange(today()); setOpen(false); }}>
                <Ionicons name="today" size={18} color={theme.primary} />
                <Text style={styles.todayButtonText}>Today</Text>
              </Pressable>
              <Pressable style={styles.saveButtonCompact} onPress={() => setOpen(false)}>
                <Text style={styles.saveButtonText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Input({ label, styles, ...props }: any) {
  return <View style={styles.inputWrap}><Text style={styles.inputLabel}>{label}</Text><TextInput {...props} style={styles.input} placeholderTextColor="#94A3B8" returnKeyType="done" /></View>;
}

function ChoiceChip({ label, selected, onPress, styles, theme }: any) {
  return <Pressable onPress={onPress} style={[styles.chip, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}><Text style={[styles.chipText, selected && { color: '#FFFFFF' }]}>{label}</Text></Pressable>;
}

function TabButton({ active, label, icon, onPress, theme, styles }: any) {
  return <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}><Ionicons name={active ? icon : `${icon}-outline`} size={22} color={active ? theme.primary : theme.muted} /><Text style={[styles.tabLabel, active && { color: theme.primary }]}>{label}</Text></Pressable>;
}

function SectionHeader({ title, action, icon, onPress, styles }: any) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Pressable style={styles.addButton} onPress={onPress}><Ionicons name={icon} size={18} color="#FFFFFF" /><Text style={styles.addButtonText}>{action}</Text></Pressable></View>;
}

function Metric({ label, value, styles }: any) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function DetailMetric({ label, value, styles }: any) {
  return <View style={styles.detailMetric}><Text style={styles.detailMetricLabel}>{label}</Text><Text style={styles.detailMetricValue}>{value}</Text></View>;
}

function SummaryCard({ label, value, icon, theme, styles }: any) {
  return <View style={styles.summaryCard}><Ionicons name={icon} size={20} color={theme.primary} /><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

function LedgerRow({ icon, iconColor, title, subtitle, amount, onDelete, styles, theme }: any) {
  return (
    <View style={styles.ledgerRow}>
      <View style={[styles.ledgerIcon, { backgroundColor: `${iconColor}18` }]}><Ionicons name={icon} size={23} color={iconColor} /></View>
      <View style={styles.flexOne}><Text style={styles.ledgerTitle}>{title}</Text><Text style={styles.ledgerSub}>{subtitle}</Text></View>
      <Text style={styles.ledgerAmount}>{amount}</Text>
      {onDelete && <Pressable onPress={onDelete} hitSlop={10} style={styles.deleteMini}><Ionicons name="trash-outline" size={18} color={theme.muted} /></Pressable>}
    </View>
  );
}

function EmptyState({ title, body, icon, theme, styles }: any) {
  return <View style={styles.empty}><Ionicons name={icon} size={42} color={theme.muted} /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>;
}

function typeIcon(type: CardType) {
  if (type === 'Credit') return 'card';
  if (type === 'Debit') return 'wallet';
  if (type === 'UPI') return 'qr-code';
  return 'cash';
}
function typeColor(type: CardType, theme: Theme) {
  if (type === 'Credit') return { main: theme.primary, soft: theme.primarySoft };
  if (type === 'Debit') return { main: theme.success, soft: theme.successSoft };
  if (type === 'UPI') return { main: theme.warning, soft: theme.warningSoft };
  return { main: theme.muted, soft: theme.border };
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0 },
    flexOne: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    loaderIcon: { width: 64, height: 64, borderRadius: 24, backgroundColor: theme.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    loadingTitle: { color: theme.text, fontSize: 20, fontWeight: '800' },
    loadingText: { color: theme.muted, marginTop: 8, textAlign: 'center' },
    appHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    kicker: { color: theme.primary, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    title: { color: theme.text, fontSize: 30, fontWeight: '900', marginTop: 2 },
    offlinePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.successSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
    offlineText: { color: theme.success, fontSize: 12, fontWeight: '800' },
    content: { flex: 1 },
    listContent: { paddingHorizontal: 18, paddingBottom: Platform.OS === 'android' ? 145 : 110 },
    heroCard: { backgroundColor: theme.primary, borderRadius: 28, padding: 20, marginTop: 8, marginBottom: 18, shadowColor: theme.shadow, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
    heroCardSmall: { backgroundColor: theme.primary, borderRadius: 28, padding: 20, marginTop: 8, marginBottom: 18 },
    detailBalanceCard: { backgroundColor: theme.primary, borderRadius: 28, padding: 20, marginHorizontal: 18, marginTop: 10, marginBottom: 14 },
    heroLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '700' },
    heroAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', marginTop: 8 },
    heroAmountSmall: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', marginTop: 8 },
    heroSubtext: { color: 'rgba(255,255,255,0.78)', marginTop: 8, lineHeight: 18 },
    heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
    metric: { width: '47%', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18, padding: 12 },
    metricLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '700' },
    metricValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 4 },
    detailMetric: { width: '47%', backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 18, padding: 12 },
    detailMetricLabel: { color: theme.muted, fontSize: 12, fontWeight: '800' },
    detailMetricValue: { color: theme.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sectionTitle: { color: theme.text, fontSize: 22, fontWeight: '900' },
    sectionTitleOnly: { color: theme.text, fontSize: 20, fontWeight: '900', marginHorizontal: 18, marginTop: 16, marginBottom: 10 },
    addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 999 },
    addButtonText: { color: '#FFFFFF', fontWeight: '900' },
    cardTile: { backgroundColor: theme.card, borderRadius: 24, padding: 16, marginBottom: 13, borderWidth: 1, borderColor: theme.border, shadowColor: theme.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardIcon: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    cardName: { color: theme.text, fontSize: 17, fontWeight: '900' },
    cardMeta: { color: theme.muted, marginTop: 4, fontSize: 13 },
    amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 16 },
    smallLabel: { color: theme.muted, fontSize: 12, fontWeight: '700' },
    tileAmount: { fontSize: 24, fontWeight: '900', marginTop: 3 },
    rightAligned: { alignItems: 'flex-end', flex: 1 },
    boldText: { color: theme.text, fontWeight: '800', marginTop: 4 },
    progressTrack: { height: 8, backgroundColor: theme.border, borderRadius: 999, overflow: 'hidden', marginTop: 14 },
    progressFill: { height: '100%', borderRadius: 999 },
    summaryRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 18 },
    summaryCard: { flex: 1, backgroundColor: theme.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: theme.border },
    summaryLabel: { color: theme.muted, marginTop: 10, fontWeight: '700' },
    summaryValue: { color: theme.text, fontSize: 20, fontWeight: '900', marginTop: 5 },
    ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderRadius: 20, padding: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 10 },
    ledgerIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    ledgerTitle: { color: theme.text, fontWeight: '900', fontSize: 15 },
    ledgerSub: { color: theme.muted, fontSize: 12, marginTop: 4 },
    ledgerAmount: { color: theme.text, fontWeight: '900', fontSize: 15 },
    deleteMini: { paddingLeft: 2 },
    empty: { alignItems: 'center', padding: 28, backgroundColor: theme.card, borderRadius: 24, borderWidth: 1, borderColor: theme.border, marginTop: 6 },
    emptyTitle: { color: theme.text, fontWeight: '900', fontSize: 18, marginTop: 12 },
    emptyBody: { color: theme.muted, textAlign: 'center', lineHeight: 20, marginTop: 6 },
    tabBar: { position: 'absolute', left: 18, right: 18, bottom: Platform.OS === 'android' ? 34 : 18, backgroundColor: theme.elevated, borderRadius: 28, borderWidth: 1, borderColor: theme.border, padding: 8, flexDirection: 'row', shadowColor: theme.shadow, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
    tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 22 },
    tabButtonActive: { backgroundColor: theme.primarySoft },
    tabLabel: { color: theme.muted, fontSize: 12, fontWeight: '900', marginTop: 2 },
    modalSafe: { flex: 1, backgroundColor: theme.bg, paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 0 : 0 },
    modalHeader: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalTitle: { color: theme.text, fontSize: 24, fontWeight: '900' },
    modalSub: { color: theme.muted, marginTop: 3 },
    closeButton: { width: 40, height: 40, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border },
    formListContent: { paddingBottom: Platform.OS === 'android' ? 80 : 40 },
    formBody: { paddingHorizontal: 18, gap: 12 },
    inputWrap: { gap: 7 },
    inputLabel: { color: theme.text, fontSize: 13, fontWeight: '900' },
    input: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13, color: theme.text, fontSize: 16 },
    dropdownButton: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 7 },
    dateButton: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 7 },
    dateIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primarySoft },
    dropdownIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    dropdownTitle: { color: theme.text, fontWeight: '900', fontSize: 15 },
    dropdownSub: { color: theme.muted, marginTop: 3, fontSize: 12 },
    dropdownBackdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.55)', justifyContent: 'flex-end', padding: 16 },
    dropdownSheet: { maxHeight: '70%', backgroundColor: theme.bg, borderRadius: 28, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
    calendarSheet: { backgroundColor: theme.bg, borderRadius: 28, borderWidth: 1, borderColor: theme.border, overflow: 'hidden', paddingBottom: 16 },
    dropdownSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
    dropdownSheetTitle: { color: theme.text, fontSize: 20, fontWeight: '900' },
    dropdownOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 18, padding: 12, marginBottom: 10 },
    dropdownList: { paddingHorizontal: 16, paddingBottom: 16 },
    calendarNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
    calendarNavButton: { width: 40, height: 40, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
    calendarMonthTitle: { color: theme.text, fontSize: 18, fontWeight: '900' },
    weekRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
    weekDay: { flex: 1, color: theme.muted, fontSize: 11, fontWeight: '900', textAlign: 'center' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
    dayCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, marginVertical: 2 },
    dayCellSelected: { backgroundColor: theme.primary },
    dayCellToday: { borderWidth: 1, borderColor: theme.primary },
    dayText: { color: theme.text, fontWeight: '800' },
    dayTextSelected: { color: '#FFFFFF' },
    calendarActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, marginTop: 14 },
    todayButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primarySoft, borderRadius: 18, paddingVertical: 13 },
    todayButtonText: { color: theme.primary, fontWeight: '900' },
    saveButtonCompact: { flex: 1, backgroundColor: theme.primary, borderRadius: 18, alignItems: 'center', paddingVertical: 13 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 },
    chip: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
    chipText: { color: theme.text, fontWeight: '800', fontSize: 13 },
    twoCol: { flexDirection: 'row', gap: 10 },
    saveButton: { backgroundColor: theme.primary, borderRadius: 18, alignItems: 'center', paddingVertical: 15, marginTop: 6 },
    saveButtonDisabled: { opacity: 0.55 },
    saveButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
    formHint: { color: theme.muted, fontSize: 13, lineHeight: 19 },
    detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 18 },
  });
}
