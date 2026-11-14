package studio.threadlabs.systemui.tests;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import com.google.android.material.button.MaterialButton;
import org.json.JSONObject;
import studio.threadlabs.systemui.SystemCollection;
import java.util.ArrayList;

/** Run on the Android UI thread with collection-fixtures.ts output from the portable projection. */
public final class SystemCollectionChecks {
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static MaterialButton row(View root, String label) {
        if (root instanceof MaterialButton button && button.getText().toString().contains(label)) return button;
        if (root instanceof ViewGroup group) for (int i=0; i<group.getChildCount(); i++) {
            MaterialButton found=row(group.getChildAt(i),label); if (found!=null) return found;
        }
        return null;
    }
    private static boolean text(View root, String expected) {
        if (root.getVisibility()!=View.VISIBLE) return false;
        if (root instanceof TextView value && expected.contentEquals(value.getText())) return true;
        if (root instanceof ViewGroup group) for (int i=0; i<group.getChildCount(); i++) if (text(group.getChildAt(i),expected)) return true;
        return false;
    }
    public static int run(Context context, JSONObject fixtures) throws Exception {
        ArrayList<JSONObject> intents=new ArrayList<>();
        SystemCollection list=new SystemCollection(context,intents::add);
        list.render(fixtures.getJSONObject("ready"));
        MaterialButton coast=row(list,"Coast"),garden=row(list,"Garden");
        check(coast!=null&&garden!=null&&text(list,"Notes"),"Projected rows and collection heading missing");
        android.graphics.Typeface nativeFont=new MaterialButton(context,null,androidx.appcompat.R.attr.borderlessButtonStyle).getTypeface();
        check(nativeFont.equals(coast.getTypeface()),"System typography replaced the host's native font");
        check(coast.isSelected()&&!garden.isSelected(),"Committed selection not presented");
        coast.performClick();
        check(intents.size()==1,"Activation missing");
        JSONObject intent=intents.get(0);
        check(intent.length()==4&&"activate-collection".equals(intent.getString("type"))&&"notes".equals(intent.getString("collectionId"))&&"coast".equals(intent.getString("key"))&&"/notes/coast/".equals(intent.getString("href")),"Activation changed the shared intent");
        garden.performClick();
        check(coast.isSelected()&&!garden.isSelected(),"Activation optimistically committed selection");
        list.render(fixtures.getJSONObject("reordered"));
        check(row(list,"Coast")==coast&&row(list,"Garden")==garden,"Reorder replaced keyed native controls");
        check(!coast.isSelected()&&garden.isSelected(),"Projected selection did not update");
        garden.performClick();
        check("garden".equals(intents.get(2).getString("key")),"Reused row emitted the wrong resource");
        list.render(fixtures.getJSONObject("pending"));
        check(text(list,"Loading…")&&row(list,"Coast")==coast,"Pending refresh lost retained rows or status");
        check(nativeFont.equals(coast.getTypeface()),"Returning from serif lost the host's native font");
        list.render(fixtures.getJSONObject("error"));
        check(text(list,"Offline; notes remain available")&&row(list,"Garden")==garden,"Error lost retained rows or message");
        list.render(fixtures.getJSONObject("empty"));
        check(text(list,"No items yet")&&row(list,"Coast")==null,"Empty state retained old rows");
        int before=intents.size(); coast.performClick(); garden.performClick();
        check(intents.size()==before,"Removed rows still emitted activation");
        list.render(fixtures.getJSONObject("ready"));
        MaterialButton live=row(list,"Garden");
        list.close(); list.close(); live.performClick();
        check(intents.size()==before&&!live.isEnabled(),"Closed collection still emitted activation");
        boolean refused=false;try {list.render(fixtures.getJSONObject("ready"));} catch(IllegalStateException expected) {refused=true;}
        check(refused,"Closed collection accepted another render");
        SystemCollection invalid=new SystemCollection(context,intents::add);
        JSONObject unknown=new JSONObject(fixtures.getJSONObject("ready").toString()).put("schema","unknown");
        refused=false;try {invalid.render(unknown);} catch(IllegalArgumentException expected) {refused=true;}
        check(refused,"Unsupported projection was silently accepted");invalid.close();
        return 8;
    }
}
