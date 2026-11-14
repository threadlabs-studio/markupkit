package studio.threadlabs.systemui;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.color.MaterialColors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Objects;

/** Native rows over the portable collection projection. Activation only proposes a destination. */
public final class SystemCollection extends LinearLayout implements AutoCloseable {
    public interface IntentSink { void send(JSONObject intent); }
    private IntentSink sink;
    private boolean closed;
    private String collectionId;
    private Integer accentText;
    private final TextView heading, status;
    private final ProgressBar progress;
    private final LinearLayout rows;
    private final LinkedHashMap<String,Row> controls=new LinkedHashMap<>();

    public SystemCollection(Context context, IntentSink sink) {
        super(context); this.sink=Objects.requireNonNull(sink); setOrientation(VERTICAL);
        heading=new TextView(context);androidx.core.view.ViewCompat.setAccessibilityHeading(heading,true);addView(heading);
        status=new TextView(context);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);addView(status);
        progress=new ProgressBar(context);progress.setVisibility(GONE);addView(progress,new LayoutParams(dp(32),dp(32)));
        rows=new LinearLayout(context);rows.setOrientation(VERTICAL);addView(rows,new LayoutParams(-1,-2));
    }
    private int dp(int value) { return Math.round(value*getResources().getDisplayMetrics().density); }
    private void ensureOpen() { if(closed) throw new IllegalStateException("The collection presentation is closed"); }
    private void release(MaterialButton row) { row.setOnClickListener(null);row.setEnabled(false); }

    /** Map a seed through Material's light/dark text role; null restores each row's native colors. */
    public void accent(Integer seed) {
        ensureOpen();
        accentText=seed==null?null:MaterialColors.getColorRoles(getContext(),seed).getAccent();
        for(Row row:controls.values())row.accent(accentText);
    }

    /** Apply a complete projection on the UI thread; the host owns scrolling and recovery actions. */
    public void render(JSONObject view) {
        ensureOpen();
        try {
            if(!"markupkit.collection.v1".equals(view.getString("schema"))) throw new IllegalArgumentException("Unsupported collection schema");
            String id=view.getString("id"), label=view.getString("label"), state=view.getString("status"), message=view.getString("message");
            if(!java.util.Arrays.asList("ready","pending","empty","error").contains(state)) throw new IllegalArgumentException("Unsupported collection status");
            JSONObject appearance=view.getJSONObject("appearance");
            String spacing=appearance.getString("spacing"), typography=appearance.getString("typography");
            if(!java.util.Arrays.asList("system","compact","comfortable").contains(spacing)||!java.util.Arrays.asList("system","serif").contains(typography)) throw new IllegalArgumentException("Unsupported collection appearance");
            JSONArray items=view.getJSONArray("items");
            // Read the whole payload before changing controls; retain only immutable presentation values.
            ArrayList<Item> projected=new ArrayList<>();java.util.HashSet<String> keys=new java.util.HashSet<>();
            for(int i=0;i<items.length();i++) {
                JSONObject item=items.getJSONObject(i);
                Item value=new Item(item.getString("key"),item.getString("href"),item.getString("label"),item.getString("summary"),item.getBoolean("current"));
                if(!keys.add(value.key)) throw new IllegalArgumentException("Duplicate collection resource key: "+value.key);
                projected.add(value);
            }
            if(!id.equals(collectionId)) {for(MaterialButton row:controls.values())release(row);controls.clear();rows.removeAllViews();}
            collectionId=id;heading.setText(label);status.setText(message);status.setVisibility(message.isEmpty()?GONE:VISIBLE);
            progress.setVisibility("pending".equals(state)?VISIBLE:GONE);
            for(String key:new ArrayList<>(controls.keySet())) if(!keys.contains(key)) {MaterialButton row=controls.remove(key);release(row);rows.removeView(row);}
            View focused=rows.findFocus();
            for(int i=0;i<projected.size();i++) {
                Item item=projected.get(i);Row row=controls.get(item.key);
                if(row==null) {
                    row=new Row(getContext());
                    row.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);row.setAllCaps(false);
                    controls.put(item.key,row);
                }
                row.setText((item.current?"✓ ":"")+item.label+(item.summary.isEmpty()?"":"\n"+item.summary));
                row.setSelected(item.current);
                row.accent(accentText);
                row.setTypeface("serif".equals(typography)?Typeface.SERIF:row.nativeTypeface);
                row.setOnClickListener(ignored -> {
                    if(closed)return;
                    JSONObject intent=new JSONObject();
                    try {intent.put("type","activate-collection").put("collectionId",id).put("key",item.key).put("href",item.href);}
                    catch(JSONException error){throw new IllegalArgumentException(error);}
                    sink.send(intent);
                });
                if(rows.indexOfChild(row)!=i) {rows.removeView(row);rows.addView(row,i,new LayoutParams(-1,-2));}
                LayoutParams layout=(LayoutParams)row.getLayoutParams();
                layout.topMargin=i==0?0:dp(switch(spacing){case "compact" -> 4;case "comfortable" -> 16;default -> 8;});
                row.setLayoutParams(layout);
            }
            if(focused!=null&&!focused.hasFocus())focused.requestFocus();
        } catch(JSONException error) { throw new IllegalArgumentException("Invalid collection projection",error); }
    }
    private static final class Row extends MaterialButton {
        final Typeface nativeTypeface;
        final ColorStateList nativeText;
        Row(Context context) {
            super(context,null,androidx.appcompat.R.attr.borderlessButtonStyle);
            nativeTypeface=getTypeface();nativeText=getTextColors();
        }
        void accent(Integer text) {
            setTextColor(text==null?nativeText:new ColorStateList(
                new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},
                new int[]{nativeText.getColorForState(new int[]{-android.R.attr.state_enabled},nativeText.getDefaultColor()),text}));
        }
    }
    private record Item(String key,String href,String label,String summary,boolean current) {}
    /** Terminal presentation teardown; it does not close a provider, model or navigation scene. */
    @Override public void close() {
        if(closed)return;closed=true;sink=null;
        for(MaterialButton row:controls.values())release(row);
    }
}
