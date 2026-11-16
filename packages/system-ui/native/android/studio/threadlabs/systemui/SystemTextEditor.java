package studio.threadlabs.systemui;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.color.MaterialColors;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;
import org.json.JSONObject;

/** Native presentation and input transport; all editing/operation policy stays in JavaScript. */
public final class SystemTextEditor extends LinearLayout implements AutoCloseable {
    public interface IntentSink { void send(JSONObject intent, long inputSequence); }
    private IntentSink sink;
    private boolean closed;
    private final TextInputEditText input;
    private final MaterialButton save;
    private final TextView status;
    private final TextInputLayout field;
    private final ProgressBar progress;
    private final ColorStateList defaultFill, defaultForeground;
    private final int defaultStroke;
    private final Typeface defaultContentTypeface;
    private final com.google.android.material.shape.ShapeAppearanceModel defaultShape;
    private JSONObject current;
    private AlertDialog confirmation;
    private String confirmationKey;
    private long localInputSequence;
    private boolean applying;

    public SystemTextEditor(Context context, IntentSink sink) {
        super(context); this.sink = java.util.Objects.requireNonNull(sink); setOrientation(VERTICAL);
        field = new TextInputLayout(context);
        input = new TextInputEditText(field.getContext());
        defaultContentTypeface=input.getTypeface();
        input.setMinLines(6); input.setGravity(android.view.Gravity.TOP);
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        field.addView(input, new LayoutParams(-1, -2)); addView(field);
        status = new TextView(context); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); addView(status);
        progress = new ProgressBar(context); progress.setVisibility(GONE); addView(progress, new LayoutParams(dp(32), dp(32)));
        save = new MaterialButton(context); addView(save, new LayoutParams(-2, -2));
        defaultStroke = field.getBoxStrokeColor();
        defaultFill = save.getBackgroundTintList(); defaultForeground = save.getTextColors(); defaultShape = save.getShapeAppearanceModel();
        save.setOnClickListener(ignored -> emit("save", null, null));
        input.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) {}
            public void afterTextChanged(Editable value) {
                if (applying || current == null) return;
                localInputSequence++;
                emit("edit", "value", value.toString());
            }
        });
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private static JSONObject object(Object... pairs) {
        JSONObject result = new JSONObject();
        try { for (int i=0; i<pairs.length; i+=2) result.put((String)pairs[i], pairs[i+1]); }
        catch (org.json.JSONException error) { throw new IllegalArgumentException(error); }
        return result;
    }
    private void emit(String type, String key, String value) {
        if (current == null || !current.optBoolean("active")) return;
        JSONObject intent = object("type", type, "sessionId", current.optString("sessionId"));
        try { if (key != null) intent.put(key, value); }
        catch (org.json.JSONException error) { throw new IllegalArgumentException(error); }
        sink.send(intent, localInputSequence);
    }
    private void choose(JSONObject captured, JSONObject leave, String choice) {
        if (current == null || !current.optString("sessionId").equals(captured.optString("sessionId"))) return;
        JSONObject active = current.optJSONObject("leave");
        if (active == null || !active.optString("id").equals(leave.optString("id"))) return;
        sink.send(object("type", "choose-leave", "sessionId", captured.optString("sessionId"), "leaveId", leave.optString("id"), "choice", choice), localInputSequence);
    }
    /** The host echoes transport inputSequence; an older async echo cannot reset newer native input. */
    public void render(JSONObject view, long acknowledgedInputSequence) {
        ensureOpen();
        if (!"markupkit.text-editor.v1".equals(view.optString("schema"))) throw new IllegalArgumentException("Unsupported text editor schema");
        JSONObject appearance = view.optJSONObject("appearance");
        if (appearance == null || !java.util.Arrays.asList("system", "round").contains(appearance.optString("action")) ||
                !java.util.Arrays.asList("system", "compact", "comfortable").contains(appearance.optString("spacing")) ||
                !java.util.Arrays.asList("system", "serif").contains(appearance.optString("typography"))) throw new IllegalArgumentException("Unsupported text editor appearance");
        boolean sameSession = current != null && current.optString("sessionId").equals(view.optString("sessionId"));
        if (sameSession && view.optLong("revision") < current.optLong("revision")) return;
        current = view;
        if (!sameSession) localInputSequence = acknowledgedInputSequence;
        JSONObject descriptor = view.optJSONObject("field"), action = view.optJSONObject("save");
        if (descriptor == null || action == null) throw new IllegalArgumentException("Editor requires field and Save descriptors");
        field.setHint(descriptor.optString("label")); field.setPlaceholderText(descriptor.optString("placeholder"));
        input.setEnabled(view.optBoolean("active"));
        String value = view.optString("value");
        if ((!sameSession || acknowledgedInputSequence >= localInputSequence) && !input.getText().toString().equals(value)) {
            applying = true;
            try { input.setText(value); input.setSelection(input.length()); }
            finally { applying = false; }
        }
        input.setTypeface("serif".equals(appearance.optString("typography")) ? Typeface.SERIF : defaultContentTypeface);
        int gap = dp(switch (appearance.optString("spacing")) { case "compact" -> 8; case "comfortable" -> 24; default -> 16; });
        for (int i=1; i<getChildCount(); i++) { LayoutParams params=(LayoutParams)getChildAt(i).getLayoutParams(); params.topMargin=gap; getChildAt(i).setLayoutParams(params); }
        save.setShapeAppearanceModel("round".equals(appearance.optString("action")) ? defaultShape.toBuilder().setAllCornerSizes(new com.google.android.material.shape.RelativeCornerSize(0.5f)).build() : defaultShape);
        save.setText(action.optString("label")); save.setEnabled(action.optBoolean("enabled") && !action.optBoolean("pending"));
        progress.setVisibility(action.optBoolean("pending") ? VISIBLE : GONE);
        status.setText(view.optJSONObject("status").optString("text"));
        updateConfirmation();
    }
    public void accent(Integer fill, Integer foreground) {
        ensureOpen();
        save.setBackgroundTintList(fill == null ? defaultFill : boundedColor(defaultFill, fill));
        save.setTextColor(foreground == null ? defaultForeground : boundedColor(defaultForeground, foreground));
        field.setBoxStrokeColor(fill == null ? defaultStroke : fill);
    }
    private ColorStateList boundedColor(ColorStateList defaults, int color) {
        int disabled=defaults.getColorForState(new int[]{-android.R.attr.state_enabled},defaults.getDefaultColor());
        return new ColorStateList(new int[][]{{-android.R.attr.state_enabled},{}},new int[]{disabled,color});
    }
    private void updateConfirmation() {
        JSONObject view=current, leave=view.optJSONObject("leave");
        if (leave==null) { dismissConfirmation(); return; }
        String key=view.optString("sessionId")+"/"+leave.optString("id")+"/"+leave.optString("title")+"/"+leave.optString("message");
        if (!key.equals(confirmationKey)) {
            dismissConfirmation(); confirmationKey=key;
            confirmation=new MaterialAlertDialogBuilder(getContext()).setTitle(leave.optString("title")).setMessage(leave.optString("message"))
                .setPositiveButton(leave.optJSONObject("save").optString("label"),null)
                .setNegativeButton(leave.optJSONObject("stay").optString("label"),null)
                .setNeutralButton(leave.optJSONObject("discard").optString("label"),null).create();
            confirmation.setOnCancelListener(dialog -> choose(view,leave,"stay"));
            confirmation.setOnShowListener(dialog -> {
                AlertDialog shown=(AlertDialog)dialog;
                shown.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button -> choose(view,leave,"save"));
                shown.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(button -> choose(view,leave,"stay"));
                shown.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(button -> choose(view,leave,"discard"));
            });
            confirmation.show();
        }
        confirmation.setMessage(leave.optString("message")+("saving".equals(leave.optString("phase")) ? "\n\n"+view.optJSONObject("status").optString("text") : ""));
        for (String name:java.util.Arrays.asList("save","stay","discard")) {
            int button=switch(name){case "save" -> AlertDialog.BUTTON_POSITIVE;case "stay" -> AlertDialog.BUTTON_NEGATIVE;default -> AlertDialog.BUTTON_NEUTRAL;};
            JSONObject action=leave.optJSONObject(name);
            confirmation.getButton(button).setText(action.optString("label"));
            confirmation.getButton(button).setEnabled(action.optBoolean("enabled")&&!action.optBoolean("pending"));
        }
        confirmation.getButton(AlertDialog.BUTTON_NEUTRAL).setTextColor(MaterialColors.getColor(this,android.R.attr.colorError));
    }
    private void dismissConfirmation() { if (confirmation!=null) confirmation.dismiss(); confirmation=null; confirmationKey=null; }
    private void ensureOpen() {
        if (closed) throw new IllegalStateException("The editor presentation is closed");
    }
    /** Disconnect this presentation only. The host retains its model and in-flight provider operations. */
    @Override public void close() {
        if (closed) return;
        closed = true;
        current = null;
        sink = null;
        input.setEnabled(false);
        save.setEnabled(false);
        dismissConfirmation();
    }
}
